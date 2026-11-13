import { Platform } from 'react-native';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';

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

export function speechSupported(): boolean {
  if (Platform.OS !== 'ios' && !(Platform.OS === 'android' && Number(Platform.Version) >= 33)) return false;
  try { return ExpoSpeechRecognitionModule.isRecognitionAvailable(); } catch { return false; }
}

/** Asks for speech recognition access (iOS shows its own prompt; Android only needs the mic). */
export async function ensureSpeechPermission(): Promise<boolean> {
  if (!speechSupported()) return false;
  try {
    const current = await ExpoSpeechRecognitionModule.getPermissionsAsync();
    if (current.granted) return true;
    if (!current.canAskAgain) return false;
    return (await ExpoSpeechRecognitionModule.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

let session = 0;

/**
 * Listen for one line. `onTranscript` gets the whole transcript so far each
 * time it changes; `onFail` fires once if recognition can't run or dies
 * mid-line. Returns a stop function (safe to call more than once).
 */
export function listenForLine(
  line: string,
  onTranscript: (text: string) => void,
  onFail: () => void,
  iosMode: 'default' | 'videoRecording' = 'default'
): () => void {
  const id = ++session;
  const live = () => id === session;
  // Android's continuous mode is segmented: each final result closes a
  // segment and the next one starts empty. iOS results are cumulative.
  let committed = '';
  // A previous session's abort can still deliver its 'end' after this one is
  // created, so 'end' only counts after this session's own 'start'.
  let started = false;
  const subs = [
    ExpoSpeechRecognitionModule.addListener('start', () => { if (live()) started = true; }),
    ExpoSpeechRecognitionModule.addListener('result', (e) => {
      if (!live()) return;
      const t = e.results[0]?.transcript?.trim() ?? '';
      if (Platform.OS === 'android' && e.isFinal) {
        committed = `${committed} ${t}`.trim();
        onTranscript(committed);
      } else {
        onTranscript(`${committed} ${t}`.trim());
      }
    }),
    ExpoSpeechRecognitionModule.addListener('error', (e) => {
      // 'no-speech' just means a quiet stretch; the caller's timers handle it.
      if (live() && e.error !== 'aborted' && e.error !== 'no-speech') fail();
    }),
    ExpoSpeechRecognitionModule.addListener('end', () => { if (live() && started) fail(); }),
  ];
  const stop = () => {
    subs.forEach((s) => s.remove());
    if (!live()) return;
    session += 1;
    try { ExpoSpeechRecognitionModule.abort(); } catch {}
  };
  const fail = () => { stop(); onFail(); };

  try {
    ExpoSpeechRecognitionModule.start({
      lang: 'en-US',
      interimResults: true,
      continuous: true,
      maxAlternatives: 1,
      // Bias toward the script's own words (names, invented terms).
      contextualStrings: [...new Set(line.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}'’-]/gu, '')).filter((w) => w.length > 2))].slice(0, 100),
      iosCategory: { category: 'playAndRecord', categoryOptions: ['defaultToSpeaker', 'allowBluetooth', 'duckOthers'], mode: iosMode },
      androidIntentOptions: { EXTRA_MASK_OFFENSIVE_WORDS: false },
    });
  } catch {
    fail();
  }
  return stop;
}
