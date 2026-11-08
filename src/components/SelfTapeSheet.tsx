import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import GradientButton from './GradientButton';
import { useTheme } from '../ThemeContext';
import { Projects, Tts, Voices } from '../api';
import { buildPrepLines } from '../lib/rehearsal';
import { isSpokenDialogue } from '../lib/format';
import { fonts, radii } from '../theme';

const COUNTDOWNS = [
  { value: 0, label: 'Off' },
  { value: 3, label: '3s' },
  { value: 5, label: '5s' },
  { value: 10, label: '10s' },
];
const DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL';

export interface BlockedStart { message: string; outOfCredits: boolean }

// The web's SelfTapeDialog: check the scene can be voiced, show the framing,
// pick a count-in, then hand over to the Studio.
export default function SelfTapeSheet({
  open, projectId, onClose, onStart, onBlocked,
}: {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onStart: (countdown: number) => void;
  onBlocked: (b: BlockedStart) => void;
}) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [countdown, setCountdown] = useState(3);
  const [cleared, setCleared] = useState(false);
  const [perm] = useCameraPermissions();
  const [live, setLive] = useState(false);

  useEffect(() => {
    if (!open) { setCleared(false); setLive(false); return; }
    let live = true;
    void (async () => {
      try {
        const [p, assigns] = await Promise.all([Projects.get(projectId), Voices.forProject(projectId).catch(() => [])]);
        const me = p.selectedCharacters?.[0] ?? p.selectedCharacter ?? null;
        const lines = buildPrepLines(
          (p.parsedLines || []).filter(isSpokenDialogue),
          (l) => l.speaker !== me,
          (s) => assigns.find((a) => a.speaker === s)?.voiceId ?? DEFAULT_VOICE
        );
        if (!lines.length) { if (live) setCleared(true); return; }
        const v = await Tts.preflight({ profile: 'enhanced', sceneTitle: p.title, projectId, lines });
        if (!live) return;
        if (v.allowed) setCleared(true);
        else {
          onClose();
          onBlocked({
            message: v.error ?? 'You don’t have enough AI voice credits remaining to start this session.',
            outOfCredits: (v.code ?? 'insufficient_voice_allowance') === 'insufficient_voice_allowance',
          });
        }
      } catch {
        if (live) setCleared(true); // the Studio runs the same check and will say so
      }
    })();
    return () => { live = false; };
  }, [open, projectId]);

  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.4)' }} activeOpacity={1} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 16 }]}>
        <Text style={{ fontFamily: fonts.heavy, fontSize: 19, color: theme.text }}>Self tape</Text>
        <Text style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: theme.muted, marginTop: 4 }}>
          Check your framing, then choose how long you want before recording starts.
        </Text>

        {/* Mirrored like a mirror; the recording itself is not. */}
        <View style={[styles.preview, { backgroundColor: theme.surfaceAlt }]}>
          {open && cleared && perm?.granted ? (
            <CameraView style={StyleSheet.absoluteFill} facing="front" mirror onCameraReady={() => setLive(true)} />
          ) : null}
          {!live ? (
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted, textAlign: 'center', paddingHorizontal: 24 }}>
              {!cleared
                ? 'Getting your scene ready…'
                : perm?.granted
                  ? 'Starting your camera…'
                  : "We can't see your camera yet. You'll be asked for access when the Studio opens."}
            </Text>
          ) : null}
        </View>

        <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.muted, marginTop: 18, marginBottom: 8 }}>Count me in</Text>
        <View style={[styles.segment, { backgroundColor: theme.surfaceAlt }]}>
          {COUNTDOWNS.map((c) => {
            const on = c.value === countdown;
            return (
              <TouchableOpacity
                key={c.value}
                onPress={() => setCountdown(c.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[styles.segItem, on && { backgroundColor: theme.surface, shadowColor: theme.shadow, shadowOpacity: 1, shadowRadius: 2, elevation: 1 }]}
              >
                <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: on ? theme.text : theme.muted }}>{c.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <GradientButton
          label={cleared ? 'Start self tape' : 'Checking your credits…'}
          disabled={!cleared}
          onPress={() => { onClose(); onStart(countdown); }}
          style={{ marginTop: 20, opacity: cleared ? 1 : 0.6 }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  preview: { aspectRatio: 16 / 9, width: '100%', borderRadius: radii.cardSm, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  segment: { flexDirection: 'row', borderRadius: 999, padding: 3, alignSelf: 'flex-start' },
  segItem: { paddingHorizontal: 16, minHeight: 34, justifyContent: 'center', borderRadius: 999 },
});
