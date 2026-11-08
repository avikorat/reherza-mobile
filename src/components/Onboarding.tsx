import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, PanResponder } from 'react-native';
import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import GradientButton from './GradientButton';
import { Logo } from './Bits';
import { useTheme } from '../ThemeContext';
import { fonts, radii } from '../theme';

// The web's first-run tutorial (components/Onboarding.tsx), same five steps and
// copy. ponytail: Feather glyphs stand in for the web's hand-drawn step art.
const STEPS: Array<{ icon: keyof typeof Feather.glyphMap; title: string; blurb: string }> = [
  { icon: 'upload', title: 'Bring in your scene', blurb: 'Paste your dialogue or upload a script — Reherza pulls out every character and line for you.' },
  { icon: 'list', title: 'Review the dialogue', blurb: "Check the parsed lines, fix anything that looks off, and pick the role you're playing." },
  { icon: 'volume-2', title: 'Cast your AI readers', blurb: 'Give every other character a distinct voice, then preview it before you run the scene.' },
  { icon: 'mic', title: 'Practice hands-free', blurb: 'Your scene partner speaks, your mic listens, and you get live word-by-word feedback as you go.' },
  { icon: 'video', title: 'Roll your self-tape', blurb: "When you're ready, capture a clean take in Self-Tape Mode and save it for your audition." },
];

const STORAGE_KEY = 'reherza_onboarding_seen';

/** Open on first launch; `reopen` powers "How it works". */
export function useOnboarding() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => { if (!v) setOpen(true); }).catch(() => {});
  }, []);
  const dismiss = useCallback(() => {
    AsyncStorage.setItem(STORAGE_KEY, '1').catch(() => {});
    setOpen(false);
  }, []);
  return { open, dismiss, reopen: useCallback(() => setOpen(true), []) };
}

export default function Onboarding({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { theme } = useTheme();
  const [index, setIndex] = useState(0);
  const isLast = index === STEPS.length - 1;
  const next = () => (isLast ? (onClose(), setIndex(0)) : setIndex((i) => i + 1));
  const prev = () => setIndex((i) => Math.max(0, i - 1));
  const nav = useRef({ next, prev });
  nav.current = { next, prev };
  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 20 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderRelease: (_, g) => { if (g.dx < -40) nav.current.next(); else if (g.dx > 40) nav.current.prev(); },
    })
  ).current;
  const step = STEPS[index];

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View {...swipe.panHandlers} accessibilityViewIsModal accessibilityLabel="Reherza tutorial" style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <TouchableOpacity onPress={() => { onClose(); setIndex(0); }} style={styles.skip} accessibilityRole="button">
            <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: theme.muted }}>Skip</Text>
          </TouchableOpacity>
          <View style={{ alignItems: 'center', paddingTop: 26 }}><Logo size={17} /></View>
          <View style={[styles.art, { backgroundColor: theme.accentBg, borderColor: theme.accentRing }]}>
            <Feather name={step.icon} size={44} color={theme.accent} />
          </View>
          <View style={{ paddingHorizontal: 28, paddingTop: 22, alignItems: 'center' }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.6, color: theme.accent, marginBottom: 6 }}>STEP {index + 1}</Text>
            <Text style={{ fontFamily: fonts.heavy, fontSize: 23, color: theme.text, textAlign: 'center', marginBottom: 6 }}>{step.title}</Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: theme.muted, textAlign: 'center', minHeight: 42 }}>{step.blurb}</Text>
          </View>
          <View style={styles.dots}>
            {STEPS.map((s, i) => (
              <TouchableOpacity key={s.title} onPress={() => setIndex(i)} accessibilityRole="button" accessibilityLabel={`Go to step ${i + 1}`} hitSlop={8}>
                <View style={{ height: 8, width: i === index ? 24 : 8, borderRadius: 4, backgroundColor: i === index ? theme.accent : theme.borderStrong }} />
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.controls}>
            <TouchableOpacity onPress={prev} disabled={index === 0} style={{ opacity: index === 0 ? 0 : 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 }} accessibilityRole="button">
              <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: theme.muted }}>← Previous</Text>
            </TouchableOpacity>
            <GradientButton label={isLast ? 'Get Started' : 'Next'} onPress={next} style={{ minWidth: 130 }} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 440, borderRadius: 24, borderWidth: 1, overflow: 'hidden' },
  skip: { position: 'absolute', top: 12, right: 12, zIndex: 1, minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  art: { marginHorizontal: 28, marginTop: 16, aspectRatio: 10 / 7, borderRadius: radii.card, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, paddingTop: 22 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 22 },
});
