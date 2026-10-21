import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Card from '../components/Card';
import GradientButton from '../components/GradientButton';
import { BackButton } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { Feedback } from '../api';
import { fonts, radii, palette } from '../theme';
import type { FeedbackBody, FeedbackFeature, FeedbackUseAgain, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Feedback'>;

const FEATURE_LABELS: Record<FeedbackFeature, string> = {
  script_import: 'Script import',
  rehearsal_room: 'Rehearsal room',
  ai_scene_partner: 'AI scene partner',
  delivery_analysis: 'Delivery analysis',
  self_tapes: 'Self-tapes',
  session_results: 'Session results',
};

const USE_AGAIN: Array<{ id: FeedbackUseAgain; label: string }> = [
  { id: 'definitely', label: 'Definitely' },
  { id: 'probably', label: 'Probably' },
  { id: 'not_sure', label: 'Not sure' },
  { id: 'probably_not', label: 'Probably not' },
  { id: 'definitely_not', label: 'Definitely not' },
];

const EMPTY: FeedbackBody = { ratings: {} };

// The web's feedback survey on one page. A half-filled form is saved as a
// draft when the user leaves, and the once-per-user prompt is dismissed if
// they leave without sending.
export default function FeedbackScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const source = route.params?.source || 'manual';
  const [features, setFeatures] = useState<FeedbackFeature[] | null>(null);
  const [form, setForm] = useState<FeedbackBody>(EMPTY);
  const [busy, setBusy] = useState(false);
  const formRef = useRef(form);
  formRef.current = form;
  const sent = useRef(false);

  useEffect(() => {
    Promise.all([Feedback.eligibility(), Feedback.draft().catch(() => ({ draft: null }))])
      .then(([e, d]) => {
        setFeatures(e.features);
        if (d.draft) setForm({ ...EMPTY, ...d.draft });
      })
      .catch((e) => {
        Alert.alert('Feedback unavailable', e instanceof Error ? e.message : 'Unknown error', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      });
    return () => {
      if (sent.current) return;
      const f = formRef.current;
      const dirty = Object.keys(f.ratings).length || f.liked || f.frustrations || f.useAgain;
      if (dirty) Feedback.saveDraft({ ...f, source, step: 0 }).catch(() => {});
      if (source === 'prompt') void Feedback.dismiss();
    };
  }, []);

  const rate = (k: FeedbackFeature, n: number) => setForm((f) => ({ ...f, ratings: { ...f.ratings, [k]: n } }));

  const submit = async () => {
    if (!Object.keys(form.ratings).length) {
      Alert.alert('Rate at least one feature', 'Tap the stars next to anything you have used.');
      return;
    }
    setBusy(true);
    try {
      await Feedback.submit({
        ...form,
        liked: form.liked?.trim() || undefined,
        frustrations: form.frustrations?.trim() || undefined,
        source,
      });
      sent.current = true;
      Feedback.clearDraft().catch(() => {});
      Alert.alert('Thank you', 'Your feedback goes straight to the team.', [{ text: 'OK', onPress: () => navigation.goBack() }]);
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  const textBox = (value: string | undefined, onChange: (v: string) => void, placeholder: string) => (
    <TextInput
      value={value || ''}
      onChangeText={onChange}
      multiline
      textAlignVertical="top"
      maxLength={2000}
      placeholder={placeholder}
      placeholderTextColor={theme.muted}
      accessibilityLabel={placeholder}
      style={[styles.box, { borderColor: theme.borderStrong, backgroundColor: theme.surface, color: theme.text }]}
    />
  );

  return (
    <Screen keyboardAvoiding>
      <BackButton onPress={() => navigation.goBack()} />
      {!features ? (
        <ActivityIndicator color={theme.accent} style={{ marginTop: 40 }} />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 24, gap: 14 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={[styles.h1, { color: theme.text }]}>How's Reherza working for you?</Text>

          <Card padding={0}>
            {features.map((k, i) => (
              <View key={k} style={[styles.rateRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }]}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: theme.text, flex: 1 }}>{FEATURE_LABELS[k] || k}</Text>
                {[1, 2, 3, 4, 5].map((n) => {
                  const on = (form.ratings[k] || 0) >= n;
                  return (
                    <TouchableOpacity
                      key={n}
                      onPress={() => rate(k, n)}
                      hitSlop={4}
                      accessibilityRole="button"
                      accessibilityLabel={`${FEATURE_LABELS[k] || k}: ${n} of 5`}
                      accessibilityState={{ selected: form.ratings[k] === n }}
                      style={styles.star}
                    >
                      <Feather name="star" size={20} color={on ? theme.accent : theme.borderStrong} />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </Card>

          <Text style={[styles.label, { color: theme.text }]}>Would you use Reherza again?</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {USE_AGAIN.map((o) => {
              const on = form.useAgain === o.id;
              return (
                <TouchableOpacity
                  key={o.id}
                  onPress={() => setForm((f) => ({ ...f, useAgain: o.id }))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.chip, { borderColor: on ? theme.accent : theme.border, backgroundColor: on ? theme.accent : theme.surface }]}
                >
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: on ? palette.white : theme.text }}>{o.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { color: theme.text }]}>What do you like?</Text>
          {textBox(form.liked, (v) => setForm((f) => ({ ...f, liked: v })), 'What works well')}
          <Text style={[styles.label, { color: theme.text }]}>What frustrates you?</Text>
          {textBox(form.frustrations, (v) => setForm((f) => ({ ...f, frustrations: v })), 'What gets in the way')}

          <GradientButton label={busy ? 'Sending…' : 'Send feedback'} disabled={busy} onPress={submit} />
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 24, letterSpacing: -0.5 },
  label: { fontFamily: fonts.bold, fontSize: 13, marginTop: 4 },
  rateRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 8 },
  star: { width: 34, height: 40, alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1 },
  box: { borderWidth: 1, borderRadius: radii.field, padding: 14, minHeight: 90, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
});
