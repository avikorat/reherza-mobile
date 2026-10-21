import {
  AudioModule,
  RecordingPresets,
  createAudioPlayer,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioPlayer,
  type AudioRecorder,
} from 'expo-audio';
import * as FileSystem from 'expo-file-system/legacy';

// ── Audio session ─────────────────────────────────────────────────────────
// The mode is flipped per turn: playback for the partner's line, record for
// yours. Left in record mode, iOS routes playback to the earpiece. The flip
// is skipped when already in the wanted mode.
let recordMode: boolean | null = null;

async function setMode(record: boolean): Promise<void> {
  if (recordMode === record) return;
  recordMode = record;
  await setAudioModeAsync({
    allowsRecording: record,
    playsInSilentMode: true,
    shouldPlayInBackground: false,
    interruptionMode: 'duckOthers',
    shouldRouteThroughEarpiece: false,
  });
}

export async function leaveRehearsalAudioMode(): Promise<void> {
  recordMode = null;
  await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
}

// ── Permission ────────────────────────────────────────────────────────────
export type MicPermission = 'granted' | 'denied' | 'undetermined';

const toState = (p: { granted: boolean; canAskAgain: boolean }): MicPermission =>
  p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';

export async function micPermission(): Promise<MicPermission> {
  return toState(await getRecordingPermissionsAsync());
}

export async function ensureMicPermission(): Promise<MicPermission> {
  return toState(await requestRecordingPermissionsAsync());
}

// ── Playback ──────────────────────────────────────────────────────────────
const ext = (mime: string) => (mime.includes('wav') ? 'wav' : mime.includes('ogg') ? 'ogg' : 'mp3');

/** Write a TTS payload to the cache once per key; returns the file uri. */
export async function cacheClip(key: string, audioBase64: string, mimeType: string): Promise<string> {
  const uri = `${FileSystem.cacheDirectory}rz-${key}.${ext(mimeType)}`;
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    await FileSystem.writeAsStringAsync(uri, audioBase64, { encoding: FileSystem.EncodingType.Base64 });
  }
  return uri;
}

let currentPlayer: AudioPlayer | null = null;

/** Play a cached clip. Resolves when playback ends, or immediately if stopped. */
export async function playClip(uri: string): Promise<void> {
  await stopPlayback();
  await setMode(false);
  const player = createAudioPlayer({ uri }, { updateInterval: 100 });
  currentPlayer = player;
  await new Promise<void>((resolve) => {
    const sub = player.addListener('playbackStatusUpdate', (st) => {
      if (!st.didJustFinish && !st.error) return;
      sub.remove();
      if (currentPlayer === player) currentPlayer = null;
      player.remove();
      resolve();
    });
    player.play();
  });
}

// Back-compat for ScriptDetail's voice preview.
export async function playBase64(audioBase64: string, mimeType = 'audio/mpeg', onDone?: () => void): Promise<void> {
  const uri = await cacheClip(`preview-${Date.now()}`, audioBase64, mimeType);
  await playClip(uri);
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  onDone?.();
}

export async function stopPlayback(): Promise<void> {
  const p = currentPlayer;
  if (!p) return;
  currentPlayer = null;
  try { p.pause(); } catch {}
  try { p.remove(); } catch {}
}

// ── Recording ─────────────────────────────────────────────────────────────
let currentRecording: AudioRecorder | null = null;
let meterTimer: ReturnType<typeof setInterval> | null = null;

export interface RecordingSample {
  /** Peak power in dBFS; -160 = silence. */
  db: number;
  durationMs: number;
}

// AAC in an .m4a container on both platforms: small, and what /api/transcribe
// already accepts from the web's Safari path.
const RECORDING_OPTIONS = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
  extension: '.m4a',
};

const METER_INTERVAL_MS = 100;

/** Start a metered recording; `onSample` fires every 100 ms while recording. */
export async function startRecording(onSample: (s: RecordingSample) => void): Promise<void> {
  if (currentRecording) await stopRecording().catch(() => null);
  await setMode(true);
  const rec = new AudioModule.AudioRecorder(RECORDING_OPTIONS);
  await rec.prepareToRecordAsync();
  rec.record();
  currentRecording = rec;
  // expo-audio only pushes status on finish/error, so the level is polled.
  meterTimer = setInterval(() => {
    if (currentRecording !== rec) return;
    const st = rec.getStatus();
    if (st.isRecording) onSample({ db: st.metering ?? -160, durationMs: st.durationMillis });
  }, METER_INTERVAL_MS);
}

export interface RecordedAudio {
  uri: string;
  base64: string;
  mimeType: string;
  durationMs: number;
  bytes: number;
}

/** Stop the active recording and read it back, or null if nothing was recording. */
export async function stopRecording(): Promise<RecordedAudio | null> {
  const rec = currentRecording;
  if (!rec) return null;
  currentRecording = null;
  if (meterTimer) { clearInterval(meterTimer); meterTimer = null; }
  let durationMs = 0;
  try {
    durationMs = rec.getStatus().durationMillis;
    await rec.stop();
  } catch {
    return null;
  }
  const uri = rec.uri;
  if (!uri) return null;
  const [base64, info] = await Promise.all([
    FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }),
    FileSystem.getInfoAsync(uri),
  ]);
  return {
    uri,
    base64,
    mimeType: 'audio/mp4',
    durationMs,
    bytes: info.exists ? info.size ?? 0 : 0,
  };
}

/** Upload a local file's raw bytes to a presigned PUT url. */
export async function putFile(uploadURL: string, uri: string, contentType: string): Promise<boolean> {
  const res = await FileSystem.uploadAsync(uploadURL, uri, {
    httpMethod: 'PUT',
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: { 'Content-Type': contentType },
  });
  return res.status >= 200 && res.status < 300;
}
