import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Card from '../components/Card';
import GradientButton from '../components/GradientButton';
import { useTheme } from '../ThemeContext';
import { scoreFill, scoreLabel, scoreText } from '../lib/scoreColors';
import { fonts, radii, palette } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'SessionResults'>;

export default function SessionResultsScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { title, feedback } = route.params;
  const fb = feedback;
  const scores = fb.scores || {};

  const overall = fb.confidenceScore || scores.accuracy || 0;
  // Scores are DATA, so they take the score ramp — never the brand blue or the
  // brand gradient. See src/lib/scoreColors.ts.
  const scoreColor = overall ? scoreText(theme, overall) : theme.text;
  const gradeFill = scoreFill(overall);
  const grade = overall ? scoreLabel(overall).toUpperCase() : 'SCENE COMPLETE';
  const mins = Math.floor((fb.durationSeconds || 0) / 60);
  const secs = (fb.durationSeconds || 0) % 60;

  const metrics: Array<{ label: string; value: string; good: boolean }> = [
    ...(scores.accuracy != null
      ? [{ label: 'Accuracy', value: `${scores.accuracy}%`, good: scores.accuracy >= 85 }]
      : []),
    ...(scores.completion != null
      ? [{ label: 'Completion', value: `${scores.completion}%`, good: scores.completion >= 100 }]
      : []),
    {
      label: 'Lines done',
      value: `${fb.linesCompleted ?? 0}/${fb.totalLines ?? 0}`,
      good: (fb.linesCompleted ?? 0) >= (fb.totalLines ?? 1),
    },
    { label: 'Duration', value: `${mins}:${String(secs).padStart(2, '0')}`, good: true },
  ];

  // Per-line coach notes: transcribed lines that drifted from the script.
  const analyzed = (fb.lines || []).filter((l) => l.analyzed);
  const notes = analyzed
    .filter((l) => l.accuracy != null && l.accuracy < 0.9)
    .slice(0, 4)
    .map((l) => ({
      ref: `${l.speaker} · line ${(l.lineIndex ?? 0) + 1}`,
      coach: l.spoken
        ? `you said “${l.spoken}” — the script reads “${l.expected}”.`
        : 'this line was hard to hear — try it once more, a touch louder.',
    }));

  return (
    <Screen padded={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20, gap: 16 }}>
        <View style={{ alignItems: 'center', paddingTop: 6 }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: theme.muted, marginBottom: 4 }}>
            {title || 'Rehearsal'} · full scene
          </Text>
          <Text style={[styles.score, { color: scoreColor }]}>{overall || '—'}</Text>
          <View style={[styles.grade, { backgroundColor: gradeFill }]}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: palette.slate900, letterSpacing: 0.6 }}>
              {grade}
            </Text>
          </View>
          {fb.analysisSkipped ? (
            <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted, marginTop: 10, textAlign: 'center' }}>
              Line analysis was skipped this run — allow microphone access to get accuracy scores.
            </Text>
          ) : null}
        </View>

        <View style={styles.metricGrid}>
          {metrics.map((m) => (
            <Card key={m.label} style={{ width: '48%' }} padding={13}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: theme.muted, marginBottom: 4 }}>{m.label}</Text>
              <Text
                style={{
                  fontFamily: fonts.heavy,
                  fontSize: 26,
                  letterSpacing: -0.6,
                  color: m.good ? theme.success : theme.warning,
                }}
              >
                {m.value}
              </Text>
            </Card>
          ))}
        </View>

        {notes.length ? (
          <>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.text }}>Line by line</Text>
            {notes.map((n) => (
              <Card key={n.ref} padding={13}>
                <Text style={{ fontFamily: fonts.heavy, fontSize: 10.5, letterSpacing: 0.4, color: theme.muted, marginBottom: 6 }}>
                  {n.ref}
                </Text>
                <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted, lineHeight: 18 }}>
                  <Text style={{ color: theme.accent2, fontFamily: fonts.bold }}>Coach: </Text>
                  {n.coach}
                </Text>
              </Card>
            ))}
          </>
        ) : analyzed.length ? (
          <Card padding={13}>
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted, lineHeight: 19 }}>
              <Text style={{ color: theme.accent2, fontFamily: fonts.bold }}>Coach: </Text>
              Word-perfect on every analyzed line. Run it again for pace and feeling.
            </Text>
          </Card>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.bg }]}>
        <GradientButton label="Back to Dashboard" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  score: { fontFamily: fonts.heavy, fontSize: 76, lineHeight: 80, letterSpacing: -2.4 },
  grade: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 5, borderRadius: radii.control },
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  footer: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 8, gap: 10 },
});
