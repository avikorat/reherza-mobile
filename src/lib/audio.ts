import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system';

let currentSound: Audio.Sound | null = null;

// Play a base64 audio payload from POST /api/tts. Resolves the created sound;
// `onDone` fires when playback finishes (or immediately on failure).
export async function playBase64(
  audioBase64: string,
  mimeType = 'audio/mpeg',
  onDone?: () => void
): Promise<Audio.Sound> {
  const ext = mimeType.includes('wav') ? 'wav' : mimeType.includes('ogg') ? 'ogg' : 'mp3';
  const uri = `${FileSystem.cacheDirectory}tts-${Date.now()}.${ext}`;
  await FileSystem.writeAsStringAsync(uri, audioBase64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await stopPlayback();
  await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, allowsRecordingIOS: false });
  const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
  currentSound = sound;
  sound.setOnPlaybackStatusUpdate((status) => {
    if (status.isLoaded && status.didJustFinish) {
      sound.unloadAsync().catch(() => {});
      if (currentSound === sound) currentSound = null;
      FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
      onDone?.();
    }
  });
  return sound;
}

export async function stopPlayback(): Promise<void> {
  if (currentSound) {
    const s = currentSound;
    currentSound = null;
    try {
      await s.stopAsync();
    } catch {}
    try {
      await s.unloadAsync();
    } catch {}
  }
}

let currentRecording: Audio.Recording | null = null;

// Ask for mic permission and start recording. Returns true when recording.
export async function startRecording(): Promise<boolean> {
  const perm = await Audio.requestPermissionsAsync();
  if (!perm.granted) return false;
  await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
  if (currentRecording) await stopRecording().catch(() => null);
  const { recording } = await Audio.Recording.createAsync(
    Audio.RecordingOptionsPresets.HIGH_QUALITY
  );
  currentRecording = recording;
  return true;
}

export interface RecordedAudio {
  base64: string;
  mimeType: string;
}

// Stop the active recording and return { base64, mimeType }, or null.
export async function stopRecording(): Promise<RecordedAudio | null> {
  if (!currentRecording) return null;
  const rec = currentRecording;
  currentRecording = null;
  try {
    await rec.stopAndUnloadAsync();
  } catch {
    return null;
  }
  await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
  const uri = rec.getURI();
  if (!uri) return null;
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {});
  const mimeType = uri.endsWith('.wav') ? 'audio/wav' : 'audio/m4a';
  return { base64, mimeType };
}
