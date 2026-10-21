import { Alert, Linking } from 'react-native';
import { ensureMicPermission, micPermission, type MicPermission } from './audio';

// Permission flow shared by the rehearsal room and the Studio.
//
// The OS prompt cannot carry our own words on Android, and on iOS it shows
// them once. So the ask is staged: a native dialog first says what the
// permission is for and what is and isn't recorded, then the system prompt
// follows. Once a permission has been refused for good, the only fix is the
// system Settings screen, so that path gets its own dialog with a shortcut.

export type PermissionKind = 'microphone' | 'camera';

const COPY: Record<PermissionKind, { title: string; body: string; settingsTitle: string; settingsBody: string }> = {
  microphone: {
    title: 'Allow microphone access',
    body:
      'Reherza listens while you rehearse so it can tell when your line ends, check your words against the script, and score your delivery.\n\n' +
      'Audio is captured only on your turn, while the scene is running. Nothing is recorded in the background.\n\n' +
      'Your lines are sent to Reherza and processed by OpenAI to transcribe and score them. They are not used to train AI models.',
    settingsTitle: 'Microphone is off for Reherza',
    settingsBody:
      'Without the microphone, the scene cannot advance on its own and your lines cannot be scored. ' +
      'Turn it on in Settings, or rehearse manually by tapping Done Speaking after each line.',
  },
  camera: {
    title: 'Allow camera and microphone',
    body:
      'The Studio records your self-tape with the front camera and the microphone, with your lines on screen as a teleprompter.\n\n' +
      'Recording starts only when you tap the red button. A take stays on this device until you choose to save it.',
    settingsTitle: 'Camera or microphone is off for Reherza',
    settingsBody: 'Self-tapes need both. Turn them on for Reherza in Settings, then come back to the Studio.',
  },
};

/** The rationale dialog. Resolves true when the user wants to continue to the system prompt. */
export function explainPermission(kind: PermissionKind): Promise<boolean> {
  const c = COPY[kind];
  return new Promise((resolve) =>
    Alert.alert(c.title, c.body, [
      { text: 'Not now', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continue', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) })
  );
}

/** The permanently-denied dialog, with a jump to the app's Settings page. */
export function openSettingsForPermission(kind: PermissionKind): Promise<void> {
  const c = COPY[kind];
  return new Promise((resolve) =>
    Alert.alert(c.settingsTitle, c.settingsBody, [
      { text: 'Not now', style: 'cancel', onPress: () => resolve() },
      { text: 'Open Settings', onPress: () => { Linking.openSettings().catch(() => {}); resolve(); } },
    ], { cancelable: true, onDismiss: () => resolve() })
  );
}

/** Microphone, staged: explain → system prompt, or straight to Settings when already refused. */
export async function askMicrophone(): Promise<MicPermission> {
  const current = await micPermission();
  if (current === 'granted') return current;
  if (current === 'denied') {
    await openSettingsForPermission('microphone');
    return micPermission();
  }
  if (!(await explainPermission('microphone'))) return current;
  return ensureMicPermission();
}
