import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Screen from '../components/Screen';
import GradientButton from '../components/GradientButton';
import OutlineButton from '../components/OutlineButton';
import PickerSheet from '../components/PickerSheet';
import { useToast } from '../components/Toast';
import { BackButton, HeaderAction } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { ApiError, Projects } from '../api';
import { creditsLabel, formatScriptTitle, spokenDialogueCount } from '../lib/format';
import { fonts, radii, palette } from '../theme';
import type { ParsedLine, Project, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ScriptEditor'>;

const EMOTIONS = ['neutral', 'calm', 'confident', 'happy', 'joyful', 'excited', 'playful', 'sarcastic', 'angry', 'frustrated', 'anxious', 'nervous', 'startled', 'afraid', 'sad', 'emotional', 'tender', 'defeated'];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const LOW_CONFIDENCE = 0.55;
const ACTIONS_HIDDEN_KEY = 'reherza_editor_actions_hidden';
const FORMAT_ERROR_CODES = new Set(['SCRIPT_FORMAT_UNRECOGNIZED', 'SCRIPT_NOT_EXTRACTABLE']);

type Role = 'ai' | 'user';
interface EditLine {
  clientId: string;
  speaker: string;
  dialogue: string;
  action: string;
  note: string;
  role?: Role;
  emotion: string;
  intensity?: number;
  deliveryNote: string;
  audioTags?: string[];
  confidence?: number;
  page?: number;
  showAction: boolean;
  showNote: boolean;
  showPerformance: boolean;
}

let seq = 0;
const genId = () => `l${Date.now().toString(36)}${(seq++).toString(36)}`;

function toEditLines(lines: ParsedLine[]): EditLine[] {
  return lines.map((l) => {
    const type = l.type ?? 'dialogue';
    const dialogue = type === 'dialogue' ? l.text ?? '' : '';
    const action = l.action || (type === 'action' ? l.text ?? '' : '');
    const note = l.note || (type === 'note' ? l.text ?? '' : '');
    const emotion = (l.emotion ?? '').trim();
    const deliveryNote = (l.deliveryNote ?? '').trim();
    return {
      clientId: genId(), speaker: l.speaker ?? '', dialogue, action, note, role: l.role, emotion,
      intensity: typeof l.intensity === 'number' ? l.intensity : undefined, deliveryNote, audioTags: l.audioTags,
      confidence: l.confidence, page: (l as { page?: number }).page,
      showAction: !!action.trim(), showNote: !!note.trim(), showPerformance: !!(emotion || deliveryNote || typeof l.intensity === 'number'),
    };
  });
}

const newLine = (speaker = ''): EditLine => ({
  clientId: genId(), speaker, dialogue: '', action: '', note: '', emotion: '', deliveryNote: '',
  showAction: false, showNote: false, showPerformance: false,
});

// The web's /scripts/:id/edit.
export default function ScriptEditorScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const toast = useToast();
  const insets = useSafeAreaInsets();
  const projectId = route.params.id;
  const [project, setProject] = useState<Project | null>(null);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [dirty, setDirty] = useState(false);
  const [filter, setFilter] = useState('');
  const [showActions, setShowActions] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [emotionFor, setEmotionFor] = useState<string | null>(null);
  const selections = useRef<Record<string, number>>({});
  const deletedSpoken = useRef<Set<string>>(new Set());
  const hydrated = useRef<Set<string>>(new Set());
  const prevStatus = useRef<string | undefined>(undefined);
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;

  useEffect(() => {
    AsyncStorage.getItem(ACTIONS_HIDDEN_KEY).then((v) => setShowActions(v !== '1')).catch(() => {});
  }, []);
  const toggleActions = () => {
    const next = !showActions;
    setShowActions(next);
    (next ? AsyncStorage.removeItem(ACTIONS_HIDDEN_KEY) : AsyncStorage.setItem(ACTIONS_HIDDEN_KEY, '1')).catch(() => {});
  };

  const hydrate = (p: Project) => {
    const fresh = toEditLines(p.parsedLines || []);
    setLines(fresh);
    deletedSpoken.current = new Set();
    hydrated.current = new Set(fresh.map((l) => l.clientId));
  };

  const load = useCallback(async () => {
    try {
      const p = await Projects.get(projectId);
      setProject(p);
      if (!dirtyRef.current) hydrate(p);
    } catch {
      toast({ title: "That script doesn't exist", description: 'Taking you back to your dashboard.' });
      navigation.goBack();
    }
  }, [projectId]);
  useEffect(() => { void load(); }, [load]);

  // While a reprocess runs, poll and report how it landed, as the web does.
  const status = project?.parseStatus;
  useEffect(() => {
    if (prevStatus.current === 'processing' && status && status !== 'processing' && project) {
      const spoken = spokenDialogueCount(project.parsedLines);
      if (status === 'ready' && spoken > 0) {
        toast({ title: 'Script processed successfully', description: 'Your script has been processed again. Please review the lines before continuing.' });
      } else if (status === 'ready' || FORMAT_ERROR_CODES.has(project.parseErrorCode ?? '')) {
        toast({ title: 'Script format needs attention', description: "We couldn't identify valid dialogue from this script. Please check the formatting and try again, or add the lines manually.", variant: 'destructive' });
      } else {
        toast({ title: "We couldn't process this script", description: project.parseError ?? 'Please review the script format or edit the lines manually before continuing.', variant: 'destructive' });
      }
    }
    prevStatus.current = status;
    if (status !== 'processing') return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [status]);

  const mutate = (fn: (d: EditLine[]) => EditLine[]) => { setLines((p) => fn([...p])); setDirty(true); };
  const update = (id: string, patch: Partial<EditLine>) => mutate((d) => d.map((l) => (l.clientId === id ? { ...l, ...patch } : l)));
  const move = (i: number, dir: -1 | 1) => mutate((d) => {
    const t = i + dir;
    if (t < 0 || t >= d.length) return d;
    const [it] = d.splice(i, 1);
    d.splice(t, 0, it);
    return d;
  });
  const remove = (i: number) => mutate((d) => {
    if (d[i]?.dialogue.trim()) deletedSpoken.current.add(d[i].clientId);
    return d.filter((_, k) => k !== i);
  });
  const addAfter = (i: number) => mutate((d) => { d.splice(i + 1, 0, newLine(d[i]?.speaker ?? '')); return d; });
  const mergeDown = (i: number) => mutate((d) => {
    if (i >= d.length - 1) return d;
    const a = d[i], b = d[i + 1];
    const join = (x: string, y: string) => [x.trim(), y.trim()].filter(Boolean).join(' ');
    const action = join(a.action, b.action);
    const note = join(a.note, b.note);
    d.splice(i, 2, {
      ...a, dialogue: join(a.dialogue, b.dialogue), action, note,
      audioTags: Array.from(new Set([...(a.audioTags ?? []), ...(b.audioTags ?? [])])).slice(0, 3),
      showAction: a.showAction || b.showAction || !!action, showNote: a.showNote || b.showNote || !!note,
    });
    return d;
  });
  // Split at the cursor; with no usable cursor, at the space nearest the middle.
  const split = (id: string) => {
    const line = lines.find((l) => l.clientId === id);
    const text = line?.dialogue ?? '';
    let pos = selections.current[id] ?? -1;
    if (pos <= 0 || pos >= text.length) {
      const mid = Math.floor(text.length / 2);
      let best = -1;
      for (let k = 0; k < text.length; k++) if (text[k] === ' ' && (best === -1 || Math.abs(k - mid) < Math.abs(best - mid))) best = k;
      pos = best > 0 ? best : mid;
    }
    const first = text.slice(0, pos).trim();
    const second = text.slice(pos).trim();
    if (!second) { toast({ title: 'Place your cursor where you want to split' }); return; }
    mutate((d) => {
      const k = d.findIndex((l) => l.clientId === id);
      if (k === -1) return d;
      d.splice(k, 1, { ...d[k], dialogue: first }, { ...newLine(d[k].speaker), dialogue: second, role: d[k].role });
      return d;
    });
  };

  const speakers = useMemo(() => Array.from(new Set(lines.map((l) => l.speaker.trim()).filter(Boolean))), [lines]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) { const s = l.speaker.trim(); if (s) m.set(s, (m.get(s) ?? 0) + 1); }
    return m;
  }, [lines]);
  useEffect(() => { if (filter && !speakers.includes(filter)) setFilter(''); }, [speakers, filter]);
  const visible = lines.map((line, index) => ({ line, index }))
    .filter(({ line }) => !filter || line.speaker.trim() === filter)
    .filter(({ line }) => showActions || !!line.dialogue.trim() || !line.action.trim());
  const hiddenActions = lines.filter((l) => !l.dialogue.trim() && !!l.action.trim() && (!filter || l.speaker.trim() === filter)).length;
  const showActionsToggle = lines.some((l) => !!l.action.trim()) || !showActions;
  const isFiltered = !!filter || (!showActions && hiddenActions > 0);
  const dialogueCount = lines.filter((l) => l.speaker.trim() && l.dialogue.trim()).length;

  const spokenChanged = () => {
    const key = (rows: { speaker: string; text: string }[]) => rows.map((r) => `${r.speaker.trim().toUpperCase()}\u0000${r.text.trim().toLowerCase()}`).join('\u0001');
    const before = (project?.parsedLines ?? []).filter((l) => (l.type ?? 'dialogue') === 'dialogue' && l.speaker?.trim() && l.text?.trim()).map((l) => ({ speaker: l.speaker, text: l.text }));
    const after = lines.filter((l) => l.speaker.trim() && l.dialogue.trim()).map((l) => ({ speaker: l.speaker, text: l.dialogue }));
    return key(before) !== key(after);
  };

  const performSave = async () => {
    const cleaned = lines.filter((l) => l.dialogue.trim() || l.action.trim() || l.note.trim() || l.speaker.trim());
    if (!cleaned.some((l) => l.speaker.trim() && l.dialogue.trim())) {
      toast({ title: 'Add at least one spoken line before saving', variant: 'destructive' });
      return;
    }
    const payload: ParsedLine[] = cleaned.map((l, i) => {
      const line: ParsedLine & { page?: number } = { speaker: l.speaker.trim(), text: l.dialogue.trim(), lineIndex: i, type: 'dialogue' };
      if (l.role) line.role = l.role;
      if (l.action.trim()) line.action = l.action.trim();
      if (l.note.trim()) line.note = l.note.trim();
      if (l.emotion.trim()) line.emotion = l.emotion.trim().toLowerCase();
      if (typeof l.intensity === 'number') line.intensity = l.intensity;
      if (l.deliveryNote.trim()) line.deliveryNote = l.deliveryNote.trim();
      if (l.audioTags?.length) line.audioTags = l.audioTags;
      if (typeof l.confidence === 'number') line.confidence = l.confidence;
      if (typeof l.page === 'number') line.page = l.page;
      return line;
    });
    setSaving(true);
    try {
      await Projects.update(projectId, { parsedLines: payload });
      setDirty(false);
      deletedSpoken.current = new Set();
      toast({ title: 'Lines saved' });
      navigation.goBack();
    } catch (e) {
      toast({
        title: e instanceof ApiError && e.status === 402 ? 'Not enough credits to save this change' : "Couldn't save. Try again.",
        description: e instanceof ApiError && e.status === 402 ? e.message : undefined,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const continueSave = () => {
    const deleted = deletedSpoken.current.size;
    if (!deleted) { void performSave(); return; }
    const alsoAdded = lines.some((l) => l.dialogue.trim() && !hydrated.current.has(l.clientId));
    Alert.alert(
      'Save changes?',
      alsoAdded
        ? 'You added and deleted dialogue lines. Do you want to save these changes?'
        : deleted === 1
          ? 'You deleted a dialogue line. This change will be saved permanently.'
          : `You deleted ${deleted} dialogue lines. These changes will be saved permanently.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Confirm & Save', onPress: () => void performSave() }]
    );
  };

  const save = async () => {
    if (saving) return;
    if (!spokenChanged()) { continueSave(); return; }
    setSaving(true);
    const quoted = await Projects.editPrice(projectId).catch(() => null);
    setSaving(false);
    if (!quoted) { toast({ title: "Couldn't check what this save costs", description: 'Please try again.', variant: 'destructive' }); return; }
    if (quoted.milli <= 0) { continueSave(); return; }
    Alert.alert(
      `Save changes for ${creditsLabel(quoted.milli)}?`,
      `Your scene partner's lines have already been voiced for this script, so changing it uses ${creditsLabel(quoted.milli)} to generate the new lines. Cancel keeps the script, and your credits, as they are.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: `Use ${creditsLabel(quoted.milli)} & save`, onPress: continueSave }]
    );
  };

  const reprocess = () => {
    const run = async () => {
      setReprocessing(true);
      try {
        const updated = await Projects.reprocess(projectId);
        setProject(updated);
        setDirty(false);
        hydrate(updated);
        toast({ title: 'Processing your script', description: "This can take a minute. The lines will update when it's done." });
      } catch {
        toast({ title: "We couldn't process this script", description: 'Please review the script format or edit the lines manually before continuing.', variant: 'destructive' });
      } finally {
        setReprocessing(false);
      }
    };
    if (!dirty) { void run(); return; }
    Alert.alert('Re-parse this script?', 'Any unsaved edits in this editor will be replaced.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Re-parse', style: 'destructive', onPress: () => void run() }]);
  };

  if (!project) {
    return <Screen><View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={theme.accent} /></View></Screen>;
  }

  if (project.origin === 'library') {
    return (
      <Screen>
        <BackButton onPress={() => navigation.goBack()} />
        <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface, alignItems: 'center', marginTop: 24, padding: 24 }]}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: theme.text }}>This scene can't be edited</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20, color: theme.muted, textAlign: 'center', marginTop: 8 }}>
            Reherza Library scenes are shared, so they stay as written — and they stay free to rehearse. To work on your own version, add the script to your own scripts.
          </Text>
          <GradientButton small label="Back to the scene" onPress={() => navigation.goBack()} style={{ marginTop: 16 }} />
        </View>
      </Screen>
    );
  }

  const link = (label: string, onPress: () => void, disabled = false) => (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" style={{ minHeight: 32, justifyContent: 'center', opacity: disabled ? 0.4 : 1 }}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: theme.accent }}>{label}</Text>
    </TouchableOpacity>
  );
  const fieldLabel = (t: string) => <Text style={[styles.fieldLabel, { color: theme.muted }]}>{t}</Text>;
  const box = (extra?: object) => [styles.input, { borderColor: theme.border, backgroundColor: theme.bg, color: theme.text }, extra];

  return (
    <Screen padded={false} keyboardAvoiding>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: theme.text }}>Edit lines</Text>
        <HeaderAction label={reprocessing ? 'Reprocessing…' : '↻ Reprocess'} onPress={reprocess} disabled={reprocessing} />
      </View>

      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 110, gap: 12 }}>
        <View>
          <Text style={{ fontFamily: fonts.heavy, fontSize: 22, letterSpacing: -0.4, color: theme.text }}>{formatScriptTitle(project.title)}</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: theme.muted, marginTop: 4 }}>
            Fix names, edit text, reorder, merge or split, and choose who speaks each line. {dialogueCount} spoken line{dialogueCount === 1 ? '' : 's'}.
          </Text>
          <View style={[styles.legend, { backgroundColor: theme.surfaceAlt }]}>
            <Text style={[styles.legendText, { color: theme.muted }]}>Every line can hold three things, edited independently:</Text>
            <Text style={[styles.legendText, { color: theme.muted }]}><Text style={{ fontFamily: fonts.bold, color: theme.text }}>Dialogue</Text> — the spoken line; performed during rehearsal.</Text>
            <Text style={[styles.legendText, { color: theme.muted }]}><Text style={{ fontFamily: fonts.bold, color: theme.text }}>Action</Text> — a stage direction; not spoken, but used as context for the AI's emotion.</Text>
            <Text style={[styles.legendText, { color: theme.muted }]}><Text style={{ fontFamily: fonts.bold, color: theme.text }}>Note</Text> — a personal reminder; not spoken.</Text>
          </View>
        </View>

        {speakers.length > 1 || showActionsToggle ? (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <Text style={[styles.fieldLabel, { color: theme.muted, marginBottom: 0 }]}>{speakers.length > 1 ? 'FILTER BY CHARACTER' : 'VIEW'}</Text>
              {filter ? link('Clear', () => setFilter('')) : null}
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {speakers.length > 1 ? <Chip on={!filter} label="All" count={lines.length} onPress={() => setFilter('')} /> : null}
              {speakers.length > 1 ? speakers.map((s) => <Chip key={s} on={filter === s} label={s} count={counts.get(s) ?? 0} onPress={() => setFilter(s)} />) : null}
              {showActionsToggle ? <Chip on={false} muted={!showActions} label="Actions" count={showActions ? 'On' : 'Off'} onPress={toggleActions} /> : null}
            </View>
            {!showActions && hiddenActions > 0 ? (
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: theme.muted, marginTop: 8 }}>
                {hiddenActions} action-only {hiddenActions === 1 ? 'line is' : 'lines are'} hidden. Line numbers keep their original positions, and nothing has been removed from the script.
              </Text>
            ) : null}
          </View>
        ) : null}

        {visible.map(({ line, index: i }) => {
          const low = typeof line.confidence === 'number' && line.confidence < LOW_CONFIDENCE;
          const isLast = i === lines.length - 1;
          return (
            <View key={line.clientId} style={[styles.card, { backgroundColor: theme.surface, borderColor: low ? theme.warningFill : theme.border }]}>
              {low ? <Text style={{ fontFamily: fonts.semibold, fontSize: 11.5, color: theme.warning, marginBottom: 8 }}>⚠ Low parser confidence — please double-check this line.</Text> : null}
              <TextInput
                value={line.speaker}
                onChangeText={(v) => update(line.clientId, { speaker: v })}
                placeholder="Character name"
                placeholderTextColor={theme.muted}
                autoCapitalize="characters"
                accessibilityLabel={`Character for line ${i + 1}`}
                style={box({ fontFamily: fonts.bold, fontSize: 13.5, marginBottom: 8 })}
              />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                <View style={[styles.seg, { backgroundColor: theme.surfaceAlt }]}>
                  {([['auto', 'Auto'], ['user', 'Me'], ['ai', 'AI']] as const).map(([k, label]) => {
                    const on = k === 'auto' ? !line.role : line.role === k;
                    return (
                      <TouchableOpacity key={k} onPress={() => update(line.clientId, { role: k === 'auto' ? undefined : k })} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.segItem, on && { backgroundColor: theme.surface }]}>
                        <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: on ? theme.text : theme.muted }}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted, marginLeft: 'auto' }}>#{i + 1}</Text>
                <IconBtn label="↑" a11y="Move up" disabled={i === 0 || isFiltered} onPress={() => move(i, -1)} />
                <IconBtn label="↓" a11y="Move down" disabled={isLast || isFiltered} onPress={() => move(i, 1)} />
                <IconBtn label="✕" a11y="Delete line" onPress={() => remove(i)} />
              </View>

              {fieldLabel('DIALOGUE')}
              <TextInput
                value={line.dialogue}
                onChangeText={(v) => update(line.clientId, { dialogue: v })}
                onSelectionChange={(e) => { selections.current[line.clientId] = e.nativeEvent.selection.start; }}
                placeholder="Spoken line…"
                placeholderTextColor={theme.muted}
                multiline
                accessibilityLabel={`Dialogue for line ${i + 1}`}
                style={box({ minHeight: 44 })}
              />

              {line.showAction && showActions ? (
                <View style={{ marginTop: 10 }}>
                  {fieldLabel('ACTION')}
                  <TextInput value={line.action} onChangeText={(v) => update(line.clientId, { action: v })} placeholder="Stage direction…" placeholderTextColor={theme.muted} multiline style={box({ fontStyle: 'italic', color: theme.muted })} />
                  <Text style={[styles.help, { color: theme.muted }]}>Stage direction — not spoken. Used as context to shape the AI's emotional delivery.</Text>
                </View>
              ) : null}

              {line.showNote ? (
                <View style={{ marginTop: 10 }}>
                  {fieldLabel('NOTE')}
                  <TextInput value={line.note} onChangeText={(v) => update(line.clientId, { note: v })} placeholder="Note to self…" placeholderTextColor={theme.muted} multiline style={box({ color: theme.muted })} />
                  <Text style={[styles.help, { color: theme.muted }]}>Personal reminder for you — not spoken and not part of the performance.</Text>
                </View>
              ) : null}

              {line.showPerformance ? (
                <View style={{ marginTop: 10, gap: 8 }}>
                  {fieldLabel('PERFORMANCE')}
                  <TouchableOpacity onPress={() => setEmotionFor(line.clientId)} accessibilityRole="button" style={[styles.input, { borderColor: theme.border, backgroundColor: theme.bg, justifyContent: 'center' }]}>
                    <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: line.emotion ? theme.text : theme.muted }}>
                      {line.emotion ? (EMOTIONS.includes(line.emotion) ? cap(line.emotion) : `Legacy: ${line.emotion}`) : 'Select emotion'}
                    </Text>
                  </TouchableOpacity>
                  {/* ponytail: −/+ in 5% steps stands in for the web's range slider. */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>Intensity</Text>
                    <IconBtn label="−" a11y="Less intense" onPress={() => update(line.clientId, { intensity: Math.max(0, Math.round(((line.intensity ?? 0.5) - 0.05) * 100) / 100) })} />
                    <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: theme.surfaceAlt, overflow: 'hidden' }}>
                      <View style={{ width: `${(line.intensity ?? 0.5) * 100}%`, height: '100%', backgroundColor: theme.accent }} />
                    </View>
                    <IconBtn label="+" a11y="More intense" onPress={() => update(line.clientId, { intensity: Math.min(1, Math.round(((line.intensity ?? 0.5) + 0.05) * 100) / 100) })} />
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.muted, width: 36, textAlign: 'right' }}>{Math.round((line.intensity ?? 0.5) * 100)}%</Text>
                  </View>
                  <TextInput value={line.deliveryNote} onChangeText={(v) => update(line.clientId, { deliveryNote: v })} placeholder="Delivery note — how to read it (subtext, beat)…" placeholderTextColor={theme.muted} multiline style={box({ color: theme.muted })} />
                  <Text style={[styles.help, { color: theme.muted }]}>Shapes the AI's delivery. Not spoken. Voice settings are chosen automatically from emotion + intensity.</Text>
                </View>
              ) : null}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, marginTop: 8 }}>
                {!line.showAction && showActions ? link('+ Action', () => update(line.clientId, { showAction: true })) : null}
                {!line.showNote ? link('+ Note', () => update(line.clientId, { showNote: true })) : null}
                {!line.showPerformance ? link('+ Performance', () => update(line.clientId, { showPerformance: true })) : null}
                {link('Split', () => split(line.clientId))}
                {link('Merge ↓', () => mergeDown(i), isLast || isFiltered)}
                {link('Add line ↓', () => addAfter(i))}
              </View>
            </View>
          );
        })}

        {lines.length === 0 ? (
          <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface, alignItems: 'center', padding: 24 }]}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: theme.text }}>No lines yet</Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginTop: 4 }}>Add your first line to get started.</Text>
          </View>
        ) : visible.length === 0 && !filter && !showActions ? (
          <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface, alignItems: 'center', padding: 24 }]}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: theme.text }}>Every line here is an action</Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginTop: 4, textAlign: 'center' }}>Nothing has been removed — turn actions back on to see them.</Text>
            {link('Show actions', toggleActions)}
          </View>
        ) : visible.length === 0 && filter ? (
          <View style={[styles.card, { borderColor: theme.border, backgroundColor: theme.surface, alignItems: 'center', padding: 24 }]}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: theme.text }}>No lines for {filter}</Text>
            {link('Show all lines', () => setFilter(''))}
          </View>
        ) : null}

        <TouchableOpacity onPress={() => mutate((d) => { d.push(newLine(filter)); return d; })} accessibilityRole="button" style={[styles.addLine, { borderColor: theme.borderStrong }]}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: theme.muted }}>+ Add a line{filter ? ` for ${filter}` : ''}</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={[styles.saveBar, { backgroundColor: theme.surface, borderTopColor: theme.border, paddingBottom: insets.bottom + 10 }]}>
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>{dirty ? 'Unsaved changes' : 'All changes saved'}</Text>
        <OutlineButton small label="Cancel" onPress={() => navigation.goBack()} />
        <GradientButton small label={saving ? 'Saving…' : 'Save lines'} disabled={saving || !dirty} onPress={() => void save()} style={{ opacity: saving || !dirty ? 0.6 : 1 }} />
      </View>

      <PickerSheet
        open={!!emotionFor}
        title="Emotion"
        value={lines.find((l) => l.clientId === emotionFor)?.emotion || null}
        options={EMOTIONS.map((e) => ({ value: e, label: cap(e) }))}
        onPick={(e) => { if (emotionFor) update(emotionFor, { emotion: e }); }}
        onClose={() => setEmotionFor(null)}
      />
    </Screen>
  );
}

function Chip({ on, label, count, onPress, muted }: { on: boolean; label: string; count: number | string; onPress: () => void; muted?: boolean }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityState={{ selected: on }} style={[styles.chip, { backgroundColor: on ? theme.accent : muted ? theme.surfaceAlt : theme.surface, borderColor: on ? theme.accent : theme.border }]}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: on ? palette.white : muted ? theme.muted : theme.text }}>
        {label} <Text style={{ opacity: 0.6 }}>{count}</Text>
      </Text>
    </TouchableOpacity>
  );
}

function IconBtn({ label, a11y, onPress, disabled }: { label: string; a11y: string; onPress: () => void; disabled?: boolean }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={a11y} hitSlop={6} style={[styles.iconBtn, { borderColor: theme.border, opacity: disabled ? 0.3 : 1 }]}>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: theme.muted }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8 },
  legend: { borderRadius: 10, padding: 12, marginTop: 10, gap: 3 },
  legendText: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  card: { borderWidth: 1, borderRadius: radii.card, padding: 14 },
  fieldLabel: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.8, marginBottom: 4 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, minHeight: 40, fontFamily: fonts.regular, fontSize: 14 },
  help: { fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 16, marginTop: 4 },
  seg: { flexDirection: 'row', borderRadius: 8, padding: 2 },
  segItem: { paddingHorizontal: 12, minHeight: 30, justifyContent: 'center', borderRadius: 6 },
  iconBtn: { width: 30, height: 30, borderRadius: 7, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  chip: { paddingHorizontal: 12, minHeight: 32, justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1 },
  addLine: { borderWidth: 2, borderStyle: 'dashed', borderRadius: radii.card, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  saveBar: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: 1 },
});
