import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import GradientButton from '../components/GradientButton';
import OutlineButton from '../components/OutlineButton';
import { useToast } from '../components/Toast';
import { useTheme } from '../ThemeContext';
import { Feedback } from '../api';
import { fonts, radii, palette, PRESS_OPACITY, controlChip } from '../theme';
import type { FeedbackBody, FeedbackFeature, FeedbackUseAgain, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Feedback'>;

// Same sections, questions and order as the web's lib/feedback-features.ts.
const SECTIONS: Array<{ key: FeedbackFeature; label: string; rating: string; q1: string; q2: string; comment: string }> = [
  { key: 'script_import', label: 'Script Upload & Parsing', rating: 'How accurately did Reherza process your script?', q1: 'Were the characters and dialogue separated correctly?', q2: 'Did Reherza remove stage directions and non-spoken text correctly?', comment: 'What parsing issue did you notice?' },
  { key: 'rehearsal_room', label: 'Rehearsal Room', rating: 'How smooth was your rehearsal experience?', q1: 'Was it easy to select your role and begin rehearsing?', q2: 'Did the scene move naturally from one line to the next?', comment: 'Did anything interrupt or confuse you during the rehearsal?' },
  { key: 'ai_scene_partner', label: 'AI Scene Partner', rating: 'How realistic and helpful was the AI scene partner?', q1: 'Did the AI voices match the characters well?', q2: 'Did the timing and emotional delivery feel natural?', comment: 'What would make the AI scene partner feel more realistic?' },
  { key: 'delivery_analysis', label: 'Delivery Analysis', rating: 'How useful was the delivery feedback?', q1: 'Did the pacing, filler-word and emotion feedback feel accurate?', q2: 'Were the suggestions clear and actionable?', comment: 'Was any feedback incorrect, confusing or unnecessary?' },
  { key: 'self_tapes', label: 'Self-Tapes', rating: 'How easy was it to record and manage your self-tape?', q1: 'Was the recording process clear and reliable?', q2: 'Were you able to replay and download your recording without problems?', comment: 'What self-tape feature is missing?' },
  { key: 'session_results', label: 'Session Results', rating: 'How useful were your session score and results?', q1: 'Did the score fairly represent your performance?', q2: 'Was the line-by-line breakdown easy to understand?', comment: 'What additional result or insight would you like to see?' },
];
const FINAL = SECTIONS.length;
const TOTAL = SECTIONS.length + 1;
const USE_AGAIN: Array<{ id: FeedbackUseAgain; label: string }> = [
  { id: 'definitely', label: 'Definitely' },
  { id: 'probably', label: 'Probably' },
  { id: 'not_sure', label: 'Not sure' },
  { id: 'probably_not', label: 'Probably not' },
  { id: 'definitely_not', label: 'Definitely not' },
];

// The web's FeedbackDialog: six rated sections and a final step, with the
// draft saved as the user moves between steps and resumed where they left off.
export default function FeedbackScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const toast = useToast();
  const source = route.params?.source || 'manual';
  const [ready, setReady] = useState(false);
  const [step, setStep] = useState(0);
  const [startStep, setStartStep] = useState(0);
  const [form, setForm] = useState<FeedbackBody>({ ratings: {}, followups: {} });
  const [sending, setSending] = useState(false);
  const formRef = useRef(form);
  formRef.current = form;
  const stepRef = useRef(step);
  stepRef.current = step;
  const sent = useRef(false);

  useEffect(() => {
    Feedback.draft()
      .then(({ draft }) => {
        if (draft) {
          setForm({ ratings: draft.ratings ?? {}, followups: draft.followups ?? {}, liked: draft.liked ?? '', frustrations: draft.frustrations ?? '', useAgain: draft.useAgain ?? undefined });
          const s = Math.min(Math.max(0, draft.step ?? 0), FINAL);
          setStep(s);
          setStartStep(s);
        }
      })
      .catch(() => {})
      .finally(() => setReady(true));
    return () => {
      if (sent.current) return;
      if (source === 'prompt') void Feedback.dismiss();
    };
  }, []);

  const saveDraft = (s: number) => Feedback.saveDraft({ ...formRef.current, source, step: s }).catch(() => {});
  const go = (s: number) => { setStep(s); void saveDraft(s); };

  const section = step < FINAL ? SECTIONS[step] : null;
  const rated = section ? typeof form.ratings[section.key] === 'number' : false;
  const visibleTotal = TOTAL - startStep;
  const visibleIndex = step - startStep;
  const progress = visibleTotal > 1 ? Math.round((visibleIndex / (visibleTotal - 1)) * 100) : 0;
  const hasAnswer = Object.keys(form.ratings).length > 0 || !!form.liked?.trim() || !!form.frustrations?.trim() || !!form.useAgain;

  const setFollowup = (k: FeedbackFeature, patch: Record<string, string | undefined>) =>
    setForm((f) => ({ ...f, followups: { ...f.followups, [k]: { ...(f.followups?.[k] ?? {}), ...patch } } }));

  const close = () => {
    if (!sent.current && hasAnswer) void saveDraft(stepRef.current);
    navigation.goBack();
  };

  const submit = async () => {
    setSending(true);
    try {
      const res = await Feedback.submit({ ...form, liked: form.liked?.trim() || undefined, frustrations: form.frustrations?.trim() || undefined, source });
      sent.current = true;
      Feedback.clearDraft().catch(() => {});
      toast({ title: res.message || 'Thanks for the feedback!' });
      navigation.goBack();
    } catch {
      toast({ title: "Couldn't send that — please try again.", variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const box = (value: string | undefined, onChange: (v: string) => void, placeholder: string, label: string, rows = 3) => (
    <TextInput
      value={value || ''}
      onChangeText={onChange}
      multiline
      textAlignVertical="top"
      maxLength={5000}
      placeholder={placeholder}
      placeholderTextColor={theme.muted}
      accessibilityLabel={label}
      style={[styles.box, { minHeight: rows * 24 + 20, borderColor: theme.border, backgroundColor: theme.surface, color: theme.text }]}
    />
  );

  return (
    <Screen keyboardAvoiding padded={false}>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ padding: 20, paddingBottom: 32, gap: 16 }}>
        {ready ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Text style={[styles.meta, { color: theme.muted }]}>Step {visibleIndex + 1} of {visibleTotal}</Text>
              <Text style={[styles.meta, { color: theme.muted }]}>{progress}%</Text>
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: theme.surfaceAlt, overflow: 'hidden' }}>
              <View style={{ width: `${progress}%`, height: '100%', backgroundColor: theme.accent }} />
            </View>
          </View>
        ) : null}
        <View>
          <Text style={[styles.h1, { color: theme.text }]}>{!ready ? 'Feedback' : section ? section.label : 'A couple of final thoughts'}</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19, color: theme.muted, marginTop: 4 }}>
            {!ready ? 'Loading your survey…' : section ? 'Rate what you experienced. A quick follow-up appears once you do.' : 'Optional — but the most useful part. Then send it our way.'}
          </Text>
        </View>

        {!ready ? <ActivityIndicator color={theme.accent} style={{ paddingVertical: 40 }} /> : section ? (
          <View style={{ gap: 14 }}>
            <Text style={[styles.label, { color: theme.text }]}>{section.rating}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <TouchableOpacity activeOpacity={PRESS_OPACITY}
                  key={n}
                  onPress={() => setForm((f) => ({ ...f, ratings: { ...f.ratings, [section.key]: n } }))}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} of 5`}
                  accessibilityState={{ selected: form.ratings[section.key] === n }}
                  style={styles.star}
                >
                  <Feather name="star" size={28} color={(form.ratings[section.key] ?? 0) >= n ? theme.accent : theme.borderStrong} />
                </TouchableOpacity>
              ))}
              {rated ? (
                <TouchableOpacity activeOpacity={PRESS_OPACITY}
                  onPress={() => setForm((f) => { const r = { ...f.ratings }; delete r[section.key]; return { ...f, ratings: r }; })}
                  accessibilityRole="button"
                  style={{ marginLeft: 8, minHeight: 40, justifyContent: 'center' }}
                >
                  <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: theme.muted }}>Clear rating</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {/* Follow-ups appear only once the section is rated, as on the web. */}
            {rated ? (
              <View style={{ gap: 14, borderTopWidth: 1, borderTopColor: theme.divider, paddingTop: 14 }}>
                {(['q1', 'q2'] as const).map((q) => (
                  <View key={q} style={{ gap: 8 }}>
                    <Text style={{ fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19, color: theme.muted }}>{section[q]}</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {(['yes', 'no'] as const).map((v) => {
                        const on = form.followups?.[section.key]?.[q] === v;
                        return (
                          <TouchableOpacity activeOpacity={PRESS_OPACITY} key={v} onPress={() => setFollowup(section.key, { [q]: on ? undefined : v })} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, { backgroundColor: on ? theme.accent : theme.surface, borderColor: on ? theme.accent : theme.border }]}>
                            <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: on ? palette.white : theme.text }}>{v === 'yes' ? 'Yes' : 'No'}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                ))}
                <Text style={{ fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19, color: theme.muted }}>{section.comment}</Text>
                {box(form.followups?.[section.key]?.comment, (v) => setFollowup(section.key, { comment: v }), 'Optional', section.comment, 2)}
              </View>
            ) : null}
          </View>
        ) : (
          <View style={{ gap: 14 }}>
            <Text style={[styles.label, { color: theme.text }]}>What worked best for you?</Text>
            {box(form.liked, (v) => setForm((f) => ({ ...f, liked: v })), 'Tell us what felt useful or worked especially well.', 'What worked best for you?')}
            <Text style={[styles.label, { color: theme.text }]}>What was frustrating, inaccurate or missing?</Text>
            {box(form.frustrations, (v) => setForm((f) => ({ ...f, frustrations: v })), 'Be specific — the more direct you are, the more useful it is.', 'What was frustrating, inaccurate or missing?')}
            <Text style={[styles.label, { color: theme.text }]}>How likely are you to use Reherza again?</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {USE_AGAIN.map((o) => {
                const on = form.useAgain === o.id;
                return (
                  <TouchableOpacity activeOpacity={PRESS_OPACITY} key={o.id} onPress={() => setForm((f) => ({ ...f, useAgain: on ? undefined : o.id }))} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, { backgroundColor: on ? theme.accent : theme.surface, borderColor: on ? theme.accent : theme.border }]}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: on ? palette.white : theme.muted }}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {ready ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
            <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={close} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 6 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: theme.muted }}>{source === 'prompt' ? 'Not now' : 'Cancel'}</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            {step > startStep ? <OutlineButton small label="Back" onPress={() => go(step - 1)} /> : null}
            {step === FINAL ? (
              <GradientButton small label={sending ? 'Sending…' : 'Send feedback'} disabled={sending || !hasAnswer} onPress={submit} style={!hasAnswer ? { opacity: 0.6 } : undefined} />
            ) : (
              <GradientButton small label="Next" onPress={() => go(step + 1)} />
            )}
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 23, letterSpacing: -0.4 },
  meta: { fontFamily: fonts.semibold, fontSize: 11.5 },
  label: { fontFamily: fonts.semibold, fontSize: 14, lineHeight: 20 },
  star: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chip: { ...controlChip, borderWidth: 1 },
  box: { borderWidth: 1, borderRadius: radii.field, padding: 12, fontFamily: fonts.regular, fontSize: 14, lineHeight: 20 },
});
