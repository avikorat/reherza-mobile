import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Card from '../components/Card';
import GradientButton from '../components/GradientButton';
import OutlineButton from '../components/OutlineButton';
import PickerSheet from '../components/PickerSheet';
import ParseProgress from '../components/ParseProgress';
import SelfTapeSheet, { type BlockedStart } from '../components/SelfTapeSheet';
import { useToast } from '../components/Toast';
import { BackButton } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { ApiError, Projects, Tts, Usage, Voices } from '../api';
import { playBase64 } from '../lib/audio';
import { creditsLabel, formatScriptTitle, isAllowanceFailure, isSpokenDialogue } from '../lib/format';
import { fonts, radii, palette } from '../theme';
import type { ParsedLine, Project, RootStackParamList, UsageInfo, Voice, VoiceAssignment } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ScriptDetail'>;

const PREVIEW_LINE = "Hello, I'm your scene partner. Ready whenever you are.";
const errMsg = (e: unknown) => (e instanceof Error ? e.message : undefined);

// The web's /scripts/:id. Rehearsals and self-tapes are NOT listed here any
// more — they live under History, as on the web.
export default function ScriptDetailScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const toast = useToast();
  const projectId = route.params.id;
  const [project, setProject] = useState<Project | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [assignments, setAssignments] = useState<VoiceAssignment[]>([]);
  const [rolesOverride, setRolesOverride] = useState<string[] | null>(null);
  const [savingRoles, setSavingRoles] = useState(false);
  const [previewing, setPreviewing] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [picking, setPicking] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [selfTapeOpen, setSelfTapeOpen] = useState(false);
  const prevStatus = useRef<string | undefined>(undefined);

  const loadVoices = useCallback(() => {
    Voices.forProject(projectId).then(setAssignments).catch(() => {});
  }, [projectId]);

  const loadProject = useCallback(async () => {
    try {
      setProject(await Projects.get(projectId));
    } catch {
      toast({ title: "That script doesn't exist", description: 'Taking you back to your dashboard.' });
      navigation.goBack();
    }
  }, [projectId]);

  useFocusEffect(
    useCallback(() => {
      void loadProject();
      loadVoices();
      Voices.available().then(setVoices).catch(() => {});
      Usage.me().then(setUsage).catch(() => {});
    }, [loadProject, loadVoices])
  );

  // Poll while parsing (3 s, as the web); refresh voices once it lands.
  const status = project?.parseStatus;
  useEffect(() => {
    if (status === 'ready' && prevStatus.current === 'processing') loadVoices();
    prevStatus.current = status;
    if (status !== 'processing') return;
    const id = setInterval(() => { Projects.get(projectId).then(setProject).catch(() => {}); }, 3000);
    return () => clearInterval(id);
  }, [status]);

  if (!project) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={theme.accent} /></View>
      </Screen>
    );
  }

  const title = formatScriptTitle(project.title);
  const speakers = project.speakers || [];
  const lines = (project.parsedLines || []).filter(isSpokenDialogue);
  const projectRoles = project.selectedCharacters?.length ? project.selectedCharacters : project.selectedCharacter ? [project.selectedCharacter] : [];
  const roles = rolesOverride ?? projectRoles;
  const me = roles[0] ?? null;
  const others = speakers.filter((s) => !roles.includes(s));
  const assignmentOf = (s: string) => assignments.find((a) => a.speaker === s);
  const allVoiced = !!me && others.length > 0 && others.every((s) => assignmentOf(s));
  const processing = project.parseStatus === 'processing';
  const failed = project.parseStatus === 'failed';
  const isLibrary = project.origin === 'library';
  const limitReached = failed && isAllowanceFailure(project.parseErrorCode);
  const overLimit = !!usage?.exceeded;
  const canReprocessNow = limitReached && !!usage && !usage.exceeded;
  const ready = !processing && !failed && !!me && (others.length === 0 || allVoiced);
  const allSelected = lines.length > 0 && selected.size === lines.length;

  const toggleRole = (s: string) => {
    if (savingRoles) return;
    const next = roles.includes(s) ? roles.filter((r) => r !== s) : [...roles, s];
    if (!next.length) return;
    setRolesOverride(next);
    setSavingRoles(true);
    Projects.update(projectId, { selectedCharacters: next })
      .then(setProject)
      .catch((e) => toast({ title: "Couldn't change your role", description: errMsg(e), variant: 'destructive' }))
      .finally(() => { setRolesOverride(null); setSavingRoles(false); });
  };

  const speak = async (voiceId: string, done: () => void) => {
    try {
      const res = await Tts.speak({ text: PREVIEW_LINE, voiceId });
      if (res.mock) toast({ title: 'Using mock audio, add ELEVENLABS_API_KEY for real voices' });
      await playBase64(res.audioBase64, res.mimeType, done);
    } catch {
      done();
      toast({ title: 'Voice failed to generate. Try again.', variant: 'destructive' });
    }
  };

  const testVoice = () => {
    const voiceId = others.map((s) => assignmentOf(s)?.voiceId).find(Boolean) || voices[0]?.voiceId;
    if (!voiceId) { toast({ title: 'No voice available to test yet', variant: 'destructive' }); return; }
    setTesting(true);
    void speak(voiceId, () => setTesting(false));
  };

  const preview = (voiceId: string) => {
    setPreviewing(voiceId);
    void speak(voiceId, () => setPreviewing(null));
  };

  const changeVoice = async (speaker: string, voiceId: string) => {
    const voice = voices.find((v) => v.voiceId === voiceId);
    if (!voice) return;
    const current = assignmentOf(speaker);
    const q = await Voices.changePrice(projectId, speaker).catch(() => null);
    const price = !q
      ? 0
      : q.isFirstPick || q.currentVoiceId === voiceId || (current && current.voiceId === voiceId) ? 0 : q.milli;
    const apply = () =>
      Voices.assign(projectId, speaker, voiceId, voice.name)
        .then(loadVoices)
        .catch((e) => toast({ title: e instanceof ApiError && e.status === 402 ? 'Not enough credits' : "Couldn't change that voice", description: errMsg(e), variant: 'destructive' }));
    if (price <= 0) { void apply(); return; }
    Alert.alert(
      `Change ${speaker}’s voice?`,
      `${speaker}'s lines have already been voiced. The new voice uses ${creditsLabel(price)} when those lines are generated again, at your next rehearsal or self-tape — nothing is charged now, and nothing at all if that voice's audio already exists.` +
        (usage?.creditsRemainingMilli != null ? ` You have ${creditsLabel(usage.creditsRemainingMilli)} left.` : ''),
      [{ text: 'Keep current voice', style: 'cancel' }, { text: 'Change voice', onPress: () => void apply() }]
    );
  };

  const retry = async () => {
    setRetrying(true);
    try {
      await Projects.reprocess(projectId);
      toast({ title: "Reprocessing… we'll parse it again in the background." });
      void loadProject();
    } catch (e) {
      toast({ title: errMsg(e) ?? "Couldn't start reprocessing. Please try again.", variant: 'destructive' });
    } finally {
      setRetrying(false);
      Usage.me().then(setUsage).catch(() => {});
    }
  };

  // One delete path for one line or a selection; priced first (edit-price),
  // then confirmed with the count and the price in the sentence.
  const confirmDelete = async (indexes: number[]) => {
    if (deleting) return;
    if (lines.length <= 1) { toast({ title: 'Keep at least one line', description: 'A script needs one spoken line.', variant: 'destructive' }); return; }
    const quoted = await Projects.editPrice(projectId).catch(() => null);
    if (!quoted) { toast({ title: "Couldn't check what this change costs", description: 'Please try again.', variant: 'destructive' }); return; }
    const price = quoted.milli > 0 ? quoted.milli : 0;
    const priceNote = price ? ` Because this script's voices already exist, the change uses ${creditsLabel(price)}.` : '';
    const single = indexes.length === 1 ? lines.find((l) => l.lineIndex === indexes[0]) : null;
    const n = indexes.length;
    Alert.alert(
      single ? 'Delete this line?' : 'Delete selected lines?',
      (single
        ? `${single.speaker}: “${single.text}” will be removed. This action cannot be undone.`
        : `You're about to delete ${n} dialogue ${n === 1 ? 'line' : 'lines'}. This action cannot be undone.`) + priceNote,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: price ? `Use ${creditsLabel(price)} & delete` : single ? 'Delete Line' : `Delete ${n} ${n === 1 ? 'Line' : 'Lines'}`,
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              const updated = await Projects.bulkDeleteLines(projectId, indexes, (project.parsedLines || []).length);
              setProject(updated);
              setSelected(new Set());
              toast({ title: single ? 'Line deleted' : `${n} line${n === 1 ? '' : 's'} deleted` });
              if (price) Usage.me().then(setUsage).catch(() => {});
            } catch (e) {
              if (e instanceof ApiError && e.status === 409) setSelected(new Set());
              toast({
                title: e instanceof ApiError && e.status === 402 ? 'Not enough credits to delete this line' : errMsg(e) || "Couldn't delete that. Please try again.",
                variant: 'destructive',
              });
            } finally {
              setDeleting(false);
            }
          },
        },
      ]
    );
  };

  const showBlocked = (b: BlockedStart) =>
    Alert.alert(
      b.outOfCredits ? 'Not enough AI voice credits' : 'Your self-tape couldn’t start',
      `${b.message}\n\n${b.outOfCredits ? 'Your self-tape didn’t start, so nothing was recorded and no credits were used.' : 'Your self-tape didn’t start. Nothing was recorded.'}`,
      b.outOfCredits ? [{ text: 'Close' }] : [{ text: 'Close', style: 'cancel' }, { text: 'Try again', onPress: () => setSelfTapeOpen(true) }]
    );

  const chip = (label: string, tone: 'warning' | 'danger') => (
    <View style={[styles.statusChip, { borderColor: tone === 'danger' ? theme.destructive : theme.warningFill, backgroundColor: tone === 'danger' ? theme.destructiveBg : theme.warningBg }]}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: tone === 'danger' ? theme.destructive : theme.warning }} />
      <Text style={{ fontFamily: fonts.bold, fontSize: 11.5, color: tone === 'danger' ? theme.destructive : theme.warning }}>{label}</Text>
    </View>
  );

  const Step = ({ n, label }: { n: number; label: string }) => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <View style={[styles.stepNum, { backgroundColor: theme.accentBg }]}><Text style={{ fontFamily: fonts.bold, fontSize: 12, color: theme.accent }}>{n}</Text></View>
      <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.text }}>{label}</Text>
    </View>
  );

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.bold, fontSize: 15, color: theme.text }}>{title}</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40, gap: 16 }}>
        <View>
          <Text style={[styles.h1, { color: theme.text }]}>{title}</Text>
          {processing || failed ? (
            <View style={{ marginTop: 8 }}>
              {chip(processing ? 'Parsing your script…' : limitReached ? 'Paused — out of credits' : 'Parsing failed', processing || limitReached ? 'warning' : 'danger')}
            </View>
          ) : (
            <Text style={{ fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 19, color: theme.muted, marginTop: 4 }}>
              {lines.length} lines · {speakers.length} characters: {speakers.join(', ')}
            </Text>
          )}
          {overLimit && !processing && !failed ? (
            <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: theme.warning, marginTop: 10 }}>
              {isLibrary
                ? "You're out of credits. Reherza Library scenes are always free to rehearse, so you can start this one as normal — scoring your performance afterwards is what needs credits."
                : "You're out of credits. You can still rehearse this script with the lines it came with, but testing, previewing or generating new voices is paused until it resets — and any line you edit from now on will play as a silent read until then."}
            </Text>
          ) : null}
          {/* Rendered only when they work — never a disabled primary. */}
          {ready ? (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <GradientButton small label="Start Rehearsal" style={{ flex: 1 }} onPress={() => navigation.navigate('RehearsalRoom', { id: projectId })} />
              <GradientButton small label="Self Tape" style={{ flex: 1 }} onPress={() => setSelfTapeOpen(true)} />
            </View>
          ) : null}
        </View>

        {processing ? (
          <View style={[styles.banner, { backgroundColor: theme.warningBg, borderColor: theme.warningFill }]}>
            <ParseProgress startedAt={project.parseStartedAt} />
          </View>
        ) : null}

        {failed ? (
          <View style={[styles.banner, limitReached ? { backgroundColor: theme.warningBg, borderColor: theme.warningFill } : { backgroundColor: theme.destructiveBg, borderColor: theme.destructive }]}>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={[styles.bannerIcon, { backgroundColor: limitReached ? theme.warningBg : theme.destructiveBg }]}>
                <Text style={{ fontSize: 17, color: limitReached ? theme.warning : theme.destructive }}>{limitReached ? '⚡' : '!'}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: limitReached ? theme.warning : theme.destructive }}>
                  {limitReached ? "You're out of credits" : "We couldn't read this script"}
                </Text>
                <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: theme.muted, marginTop: 2 }}>
                  {project.parseError ||
                    (limitReached
                      ? 'Parsing stopped because you ran out of credits. Your script is saved.'
                      : "The file may be scanned, image-only, or in a format we don't recognise yet. Your upload is saved.")}
                </Text>
                {limitReached ? (
                  <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: theme.muted, marginTop: 4 }}>
                    {canReprocessNow
                      ? 'Your script is saved and you have credits again — pick up where it stopped.'
                      : 'Your script is saved — parsing resumes when you retry after your limit resets.'}
                  </Text>
                ) : null}
                {project.rawScript && lines.length === 0 ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.text }}>Your script text — nothing was lost</Text>
                    <ScrollView nestedScrollEnabled style={{ maxHeight: 220, marginTop: 6, backgroundColor: theme.surfaceAlt, borderRadius: 8 }} contentContainerStyle={{ padding: 10 }}>
                      <Text selectable style={{ fontFamily: fonts.medium, fontSize: 12, lineHeight: 18, color: theme.text }}>{project.rawScript}</Text>
                    </ScrollView>
                    <OutlineButton
                      small
                      label="Copy text"
                      style={{ alignSelf: 'flex-start', marginTop: 8 }}
                      onPress={() =>
                        Clipboard.setStringAsync(project.rawScript ?? '')
                          .then(() => toast({ title: 'Script text copied.' }))
                          .catch(() => toast({ title: "Couldn't copy automatically", description: 'Select the text above and copy it.', variant: 'destructive' }))
                      }
                    />
                  </View>
                ) : null}
              </View>
            </View>
            <View style={{ gap: 8, marginTop: 14 }}>
              {limitReached && !canReprocessNow ? null : (
                <GradientButton
                  small
                  disabled={retrying}
                  label={canReprocessNow ? (retrying ? 'Starting…' : 'Rerun script') : retrying ? 'Trying again…' : 'Try parsing again'}
                  onPress={retry}
                />
              )}
              <OutlineButton small label="Enter the lines myself" onPress={() => navigation.navigate('ScriptEditor', { id: projectId })} />
            </View>
          </View>
        ) : null}

        {processing ? (
          <Card padding={20} style={{ alignItems: 'center' }}>
            <View style={[styles.waitIcon, { backgroundColor: theme.surfaceAlt }]}><Text style={{ fontSize: 20 }}>⏳</Text></View>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: theme.text, marginBottom: 4 }}>Setup unlocks when parsing finishes</Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, textAlign: 'center' }}>Choose your character and assign voices once your script is ready.</Text>
          </Card>
        ) : null}

        {!processing && !failed ? (
          <Card padding={18}>
            <Step n={1} label="I am playing…" />
            <Text style={{ fontFamily: fonts.regular, fontSize: 11.5, color: theme.muted, marginTop: 4, marginBottom: 12 }}>tap to add or remove roles — you can play more than one</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {speakers.map((s) => {
                const on = roles.includes(s);
                return (
                  <TouchableOpacity
                    key={s}
                    onPress={() => toggleRole(s)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.roleChip, { backgroundColor: on ? theme.accent : theme.surface, borderColor: on ? theme.accent : theme.border }]}
                  >
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: on ? palette.white : theme.text }}>{s}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {!isLibrary ? (
              <Text style={{ fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 16, color: theme.muted, marginTop: 12 }}>
                Changing roles is free. If the new cast needs a character voiced for the first time, starting may use a credit.
              </Text>
            ) : null}
          </Card>
        ) : null}

        {!processing && !failed && me && others.length > 0 ? (
          <Card padding={18}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Step n={2} label="Assign voices" />
              <TouchableOpacity onPress={testVoice} disabled={testing || overLimit} accessibilityRole="button" style={[styles.smallBtn, { borderColor: theme.accentRing, opacity: overLimit ? 0.5 : 1 }]}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.accent }}>{testing ? 'Playing…' : '🔊 Test Voice'}</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: theme.muted, marginTop: 6, marginBottom: 12 }}>
              Tap <Text style={{ fontFamily: fonts.semibold, color: theme.text }}>Test Voice</Text> to confirm you can hear your scene partner before you start.
            </Text>
            <View style={{ gap: 14 }}>
              {others.map((s) => {
                const a = assignmentOf(s);
                const v = a ? voices.find((x) => x.voiceId === a.voiceId) : null;
                return (
                  <View key={s}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: theme.text }}>{s}</Text>
                      {a ? (
                        <TouchableOpacity onPress={() => preview(a.voiceId)} disabled={!!previewing || overLimit} accessibilityRole="button" style={{ minHeight: 32, justifyContent: 'center', opacity: overLimit ? 0.5 : 1 }}>
                          <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.accent }}>{previewing === a.voiceId ? 'Playing…' : '▶ Preview'}</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                    <TouchableOpacity onPress={() => setPicking(s)} accessibilityRole="button" accessibilityLabel={`Voice for ${s}`} style={[styles.select, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                      <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.regular, fontSize: 14, color: a ? theme.text : theme.muted }}>
                        {a ? (v ? `${v.name} · ${v.gender ?? ''} / ${v.accent ?? ''}` : a.voiceName) : 'Choose a voice…'}
                      </Text>
                      <Feather name="chevron-down" size={16} color={theme.muted} />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          </Card>
        ) : null}

        {!processing && !failed && !me ? (
          <Text style={[styles.hint, { color: theme.muted }]}>Select your character above to continue</Text>
        ) : !processing && !failed && !ready && others.length > 0 ? (
          <Text style={[styles.hint, { color: theme.muted }]}>Assign a voice to each character to begin</Text>
        ) : null}

        {lines.length ? (
          <Card padding={0}>
            <View style={[styles.dialogueHead, { borderBottomColor: theme.border }]}>
              <View>
                <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.text }}>Full Dialogue</Text>
                <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>{lines.length} lines total</Text>
              </View>
              {!isLibrary ? (
                <TouchableOpacity onPress={() => navigation.navigate('ScriptEditor', { id: projectId })} accessibilityRole="button" style={{ minHeight: 36, justifyContent: 'center' }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: theme.accent }}>✎ Edit lines</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            {!isLibrary ? (
              <View style={[styles.selectBar, { borderBottomColor: theme.border }]}>
                <TouchableOpacity
                  onPress={() => setSelected(allSelected ? new Set() : new Set(lines.map((l) => l.lineIndex)))}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: allSelected }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 }}
                >
                  <Box on={allSelected} />
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.muted }}>{allSelected ? 'Clear all' : 'Select all'}</Text>
                </TouchableOpacity>
                {selected.size > 0 ? (
                  <>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.text }}>{selected.size} selected</Text>
                    <TouchableOpacity onPress={() => void confirmDelete([...selected])} disabled={deleting} accessibilityRole="button" style={[styles.delBtn, { backgroundColor: theme.destructive }]}>
                      <Feather name="trash-2" size={13} color={palette.white} />
                      <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: palette.white }}>{deleting ? 'Deleting…' : `Delete Selected (${selected.size})`}</Text>
                    </TouchableOpacity>
                  </>
                ) : null}
              </View>
            ) : null}
            {lines.map((l: ParsedLine, i) => {
              const mine = roles.includes(l.speaker);
              const on = selected.has(l.lineIndex);
              return (
                <View key={l.lineIndex} style={[styles.line, { backgroundColor: on ? theme.accentBg : i % 2 ? theme.surfaceAlt : 'transparent' }]}>
                  {!isLibrary ? (
                    <TouchableOpacity
                      onPress={() => setSelected((p) => { const n = new Set(p); if (n.has(l.lineIndex)) n.delete(l.lineIndex); else n.add(l.lineIndex); return n; })}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      accessibilityLabel={`Select line ${i + 1}`}
                      style={styles.boxHit}
                    >
                      <Box on={on} />
                    </TouchableOpacity>
                  ) : null}
                  <Text numberOfLines={2} style={{ width: 84, fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.5, color: mine ? theme.accent : theme.muted, paddingTop: 2 }}>
                    {l.speaker.toUpperCase()}
                    {mine ? <Text style={{ fontFamily: fonts.regular, letterSpacing: 0, opacity: 0.6 }}> (you)</Text> : null}
                  </Text>
                  <Text style={{ flex: 1, fontFamily: mine ? fonts.medium : fonts.regular, fontSize: 13.5, lineHeight: 19, color: theme.text, opacity: mine ? 1 : 0.85 }}>{l.text}</Text>
                  {!isLibrary ? (
                    <TouchableOpacity onPress={() => void confirmDelete([l.lineIndex])} disabled={deleting} accessibilityRole="button" accessibilityLabel="Delete line" style={styles.boxHit}>
                      <Feather name="trash-2" size={15} color={theme.muted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </Card>
        ) : null}
      </ScrollView>

      <PickerSheet
        open={!!picking}
        title={picking ? `Voice for ${picking}` : ''}
        value={picking ? assignmentOf(picking)?.voiceId ?? null : null}
        options={voices.map((v) => ({ value: v.voiceId, label: `${v.name} · ${v.gender ?? ''} / ${v.accent ?? ''}` }))}
        onPick={(id) => { if (picking) void changeVoice(picking, id); }}
        onClose={() => setPicking(null)}
      />
      <SelfTapeSheet
        open={selfTapeOpen}
        projectId={projectId}
        onClose={() => setSelfTapeOpen(false)}
        onStart={(countdown) => navigation.navigate('Studio', { id: projectId, countdown })}
        onBlocked={showBlocked}
      />
    </Screen>
  );
}

function Box({ on }: { on: boolean }) {
  const { theme } = useTheme();
  return (
    <View style={{ width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: on ? theme.accent : theme.borderStrong, backgroundColor: on ? theme.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {on ? <Feather name="check" size={12} color={palette.white} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 8 },
  h1: { fontFamily: fonts.heavy, fontSize: 24, letterSpacing: -0.5 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 3 },
  banner: { borderWidth: 1, borderRadius: radii.card, padding: 16 },
  bannerIcon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  waitIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  stepNum: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  roleChip: { paddingHorizontal: 16, minHeight: 38, justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1 },
  smallBtn: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 12, minHeight: 34, justifyContent: 'center' },
  select: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: radii.field, paddingHorizontal: 12, minHeight: 44 },
  hint: { fontFamily: fonts.regular, fontSize: 12, textAlign: 'center' },
  dialogueHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  selectBar: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingVertical: 4, borderBottomWidth: 1 },
  delBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radii.pill, paddingHorizontal: 12, minHeight: 32 },
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 8, paddingVertical: 8 },
  boxHit: { width: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
});
