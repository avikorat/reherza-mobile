import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule, type ExpoSpeechRecognitionOptions } from 'expo-speech-recognition';
import { volumeToDb } from './rehearsal';

// Live speech recognition for word-by-word turn endpointing — the native
// stand-in for the web's SpeechRecognition.
//
// Supported where it can share the mic with a recording camera:
// - Android 13+: continuous mode makes the library capture the mic in our own
//   process (VOICE_RECOGNITION) and stream it to the recognizer, so Android's
//   concurrent-capture policy lets it run next to the camera. Older Android
//   hands the mic to another app's process, which a recording camera silences.
// - iOS: the recognizer taps the shared audio session and never deactivates
//   it. The session stays play-and-record with the options expo-audio uses, so
//   a running camera take or m4a recording keeps its audio; `iosMode` is
//   'videoRecording' next to the camera, 'default' next to expo-audio.

const isAndroid13 = Platform.OS === 'android' && Number(Platform.Version) >= 33;

export function speechSupported(): boolean {
  if (Platform.OS !== 'ios' && !isAndroid13) return false;
  try { return ExpoSpeechRecognitionModule.isRecognitionAvailable(); } catch { return false; }
}

// ── Engine choice, settled once per run ──
// On-device recognition answers faster, needs no network and has no
// one-minute cap, so it's preferred wherever its English model is present.
// On Android the phone's default service may be a vendor one (Samsung's)
// that doesn't support continuous mode; Google's is named explicitly instead.
const GOOGLE_ON_DEVICE = 'com.google.android.as';
const GOOGLE_SERVICES = ['com.google.android.tts', 'com.google.android.googlequicksearchbox'];
let engine: Pick<ExpoSpeechRecognitionOptions, 'requiresOnDeviceRecognition' | 'androidRecognitionServicePackage'> = {};

async function chooseEngine(): Promise<void> {
  engine = {};
  try {
    if (Platform.OS === 'ios') {
      if (ExpoSpeechRecognitionModule.supportsOnDeviceRecognition()) engine = { requiresOnDeviceRecognition: true };
      return;
    }
    const services = ExpoSpeechRecognitionModule.getSpeechRecognitionServices();
    if (services.includes(GOOGLE_ON_DEVICE)) {
      const { installedLocales } = await ExpoSpeechRecognitionModule.getSupportedLocales({ androidRecognitionServicePackage: GOOGLE_ON_DEVICE });
      if (installedLocales.some((l) => /^en[-_]us$/i.test(l))) { engine = { requiresOnDeviceRecognition: true }; return; }
      // Android 14+ fetches the model quietly (13 would show a dialog); a
      // later run picks it up.
      if (Number(Platform.Version) >= 34) ExpoSpeechRecognitionModule.androidTriggerOfflineModelDownload({ locale: 'en-US' }).catch(() => {});
    }
    const google = GOOGLE_SERVICES.find((p) => services.includes(p));
    const current = ExpoSpeechRecognitionModule.getDefaultRecognitionService().packageName;
    if (google && !GOOGLE_SERVICES.includes(current)) engine = { androidRecognitionServicePackage: google };
  } catch {
    engine = {};
  }
}

/** Asks for speech recognition access (iOS shows its own prompt; Android only
 *  needs the mic) and picks the engine. True when recognition can run. */
export async function ensureSpeechPermission(): Promise<boolean> {
  if (!speechSupported()) return false;
  try {
    const current = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    const granted = current.granted || (current.canAskAgain && (await ExpoSpeechRecognitionModule.requestPermissionsAsync()).granted);
    if (granted) await chooseEngine();
    return granted;
  } catch {
    return false;
  }
}

// Endings worth retrying: on Android every error (a quiet stretch included)
// tears the session down, but the actor may only be taking a beat.
const FATAL = new Set(['not-allowed', 'service-not-allowed', 'language-not-supported', 'audio-capture', 'network']);
const MAX_RESTARTS = 4;

let session = 0;

export interface LineHandlers {
  /** The whole transcript so far, each time it changes. */
  onTranscript: (text: string) => void;
  /** Once, if recognition can't run for this line. */
  onFail: () => void;
  /** The input level in dB, ~every 100 ms, when asked for. */
  onVolume?: (db: number) => void;
}

/** Listen for one line. Returns a stop function (safe to call more than once). */
export function listenForLine(line: string, h: LineHandlers, iosMode: 'default' | 'videoRecording' = 'default'): () => void {
  const { onTranscript, onFail, onVolume } = h;
  const id = ++session;
  const live = () => id === session;
  // Continuous recognition is segmented on Android and on iOS 18+ (the library
  // marks each pause final, and what follows arrives as a new segment); a
  // final result closes a segment and the next starts empty. A restart also
  // starts empty, so whatever was heard is committed first.
  let committed = '';
  let interim = '';
  let last = '';
  let restarts = 0;
  let fatal = false;
  // A previous session's abort can still deliver its 'end' after this one is
  // created, so 'end' only counts after this session's own 'start'.
  let started = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const emit = () => {
    const t = `${committed} ${interim}`.trim();
    if (t !== last) { last = t; onTranscript(t); }
  };
  const subs = [
    ExpoSpeechRecognitionModule.addListener('start', () => { if (live()) started = true; }),
    ExpoSpeechRecognitionModule.addListener('result', (e) => {
      if (!live()) return;
      const t = e.results[0]?.transcript?.trim() ?? '';
      if (e.isFinal) {
        committed = `${committed} ${t}`.trim();
        interim = '';
      } else {
        interim = t;
      }
      emit();
    }),
    ExpoSpeechRecognitionModule.addListener('volumechange', (e) => { if (live() && onVolume) onVolume(volumeToDb(e.value)); }),
    ExpoSpeechRecognitionModule.addListener('error', (e) => {
      if (!live() || e.error === 'aborted') return;
      if (FATAL.has(e.error)) fatal = true;
      // An error before 'start' means this attempt never ran; its 'end' won't count.
      if (!started) ended();
    }),
    ExpoSpeechRecognitionModule.addListener('end', () => { if (live() && started) ended(); }),
  ];
  const ended = () => {
    started = false;
    committed = `${committed} ${interim}`.trim();
    interim = '';
    if (fatal && engine.requiresOnDeviceRecognition) {
      // The on-device model can't serve this (missing or busy): drop to the
      // regular service for the rest of the run rather than failing each line.
      engine = {};
      fatal = false;
    } else if (fatal || restarts >= MAX_RESTARTS) {
      fail();
      return;
    }
    restarts += 1;
    retry = setTimeout(() => { if (live()) begin(); }, 150);
  };
  const stop = () => {
    clearTimeout(retry);
    subs.forEach((s) => s.remove());
    if (!live()) return;
    session += 1;
    try { ExpoSpeechRecognitionModule.abort(); } catch {}
  };
  const fail = () => { stop(); onFail(); };
  const begin = () => {
    try {
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: true,
        maxAlternatives: 1,
        ...engine,
        // Bias toward the script's own words (names, invented terms).
        contextualStrings: [...new Set(line.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}'’-]/gu, '')).filter((w) => w.length > 2))].slice(0, 100),
        iosCategory: { category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'duckOthers'], mode: iosMode },
        androidIntentOptions: { EXTRA_MASK_OFFENSIVE_WORDS: false },
        volumeChangeEventOptions: { enabled: !!onVolume, intervalMillis: 100 },
      });
    } catch {
      fail();
    }
  };
  begin();
  return stop;
}
