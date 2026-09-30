import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

// ── Audio session ─────────────────────────────────────────────────────────
// expo-av's iOS PlayAndRecord category has no DefaultToSpeaker option, so a
// session left in record mode plays the partner's line through the earpiece.
// The mode is flipped per turn instead: playback for the AI line, record for
// yours. The flip is skipped when already in the wanted mode.
let recordMode: boolean | null = null;

async function setMode(record: boolean): Promise<void> {
  if (recordMode === record) return;
  recordMode = record;
  await Audio.setAudioModeAsync({
    allowsRecordingIOS: record,
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
    shouldDuckAndroid: true,
    playThroughEarpieceAndroid: false,
  });
}

export async function leaveRehearsalAudioMode(): Promise<void> {
  recordMode = null;
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true }).catch(() => {});
}

// ── Permission ────────────────────────────────────────────────────────────
export type MicPermission = 'granted' | 'denied' | 'undetermined';

export async function micPermission(): Promise<MicPermission> {
  const p = await Audio.getPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
}

export async function ensureMicPermission(): Promise<MicPermission> {
  const p = await Audio.requestPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
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

let currentSound: Audio.Sound | null = null;

/** Play a cached clip. Resolves when playback ends, or immediately if stopped. */
export async function playClip(uri: string): Promise<void> {
  await stopPlayback();
  await setMode(false);
  const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
  currentSound = sound;
  await new Promise<void>((resolve) => {
    sound.setOnPlaybackStatusUpdate((status) => {
      const finished = status.isLoaded ? status.didJustFinish : true;
      if (!finished) return;
      sound.setOnPlaybackStatusUpdate(null);
      sound.unloadAsync().catch(() => {});
      if (currentSound === sound) currentSound = null;
      resolve();
    });
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
  const s = currentSound;
  if (!s) return;
  currentSound = null;
  s.setOnPlaybackStatusUpdate(null);
  await s.stopAsync().catch(() => {});
  await s.unloadAsync().catch(() => {});
}

// ── Recording ─────────────────────────────────────────────────────────────
let currentRecording: Audio.Recording | null = null;

export interface RecordingSample {
  /** Peak power in dBFS; -160 = silence. */
  db: number;
  durationMs: number;
}

// AAC in an .m4a container on both platforms: small, and what /api/transcribe
// already accepts from the web's Safari path.
const RECORDING_OPTIONS: Audio.RecordingOptions = {
  ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
  android: { ...Audio.RecordingOptionsPresets.HIGH_QUALITY.android, extension: '.m4a' },
  ios: { ...Audio.RecordingOptionsPresets.HIGH_QUALITY.ios, extension: '.m4a' },
};

const METER_INTERVAL_MS = 100;

/** Start a metered recording; `onSample` fires every 100 ms while recording. */
export async function startRecording(onSample: (s: RecordingSample) => void): Promise<void> {
  if (currentRecording) await stopRecording().catch(() => null);
  await setMode(true);
  const { recording } = await Audio.Recording.createAsync(
    RECORDING_OPTIONS,
    (st) => {
      if (st.isRecording) onSample({ db: st.metering ?? -160, durationMs: st.durationMillis });
    },
    METER_INTERVAL_MS
  );
  currentRecording = recording;
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
  rec.setOnRecordingStatusUpdate(null);
  const status = await rec.getStatusAsync().catch(() => null);
  try {
    await rec.stopAndUnloadAsync();
  } catch {
    return null;
  }
  const uri = rec.getURI();
  if (!uri) return null;
  const [base64, info] = await Promise.all([
    FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 }),
    FileSystem.getInfoAsync(uri),
  ]);
  return {
    uri,
    base64,
    mimeType: 'audio/mp4',
    durationMs: status?.durationMillis ?? 0,
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
