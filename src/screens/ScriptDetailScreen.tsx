import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as WebBrowser from 'expo-web-browser';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Badge from '../components/Badge';
import GradientButton from '../components/GradientButton';
import OutlineButton from '../components/OutlineButton';
import { BackButton, HeaderAction } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { ApiError, History, Projects, SelfTapes, Tts, Voices, myCharacters, playableLines } from '../api';
import { playBase64 } from '../lib/audio';
import { scoreText } from '../lib/scoreColors';
import {
  fonts,
  radii,
  palette,
  brandGradient,
  brandGradientLocations,
  diagonalStart,
  diagonalEnd,
} from '../theme';
import type { HistoryEntry, Project, RootStackParamList, Voice, VoiceAssignment } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ScriptDetail'>;

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

export default function ScriptDetailScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const projectId = route.params.id;
  const [project, setProject] = useState<Project | null>(null);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [assigned, setAssigned] = useState<VoiceAssignment[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const load = useCallback(async () => {
    try {
      const p = await Projects.get(projectId);
      setProject(p);
      setRole((r) => r || myCharacters(p)[0] || p.speakers?.[0] || null);
      // The list shows the first speaker as "you play this" by default, so the
      // server has to agree, or Start Rehearsal bounces straight back here.
      if (!myCharacters(p).length && p.speakers?.[0]) {
        Projects.update(projectId, { selectedCharacters: [p.speakers[0]] }).catch(() => {});
      }
      const [avail, assigns] = await Promise.all([
        Voices.available().catch(() => [] as Voice[]),
        Voices.forProject(projectId).catch(() => [] as VoiceAssignment[]),
      ]);
      setVoices(avail);
      setAssigned(assigns);
      History.forProject(projectId).then((h) => setHistory(h.entries)).catch(() => {});
    } catch (e) {
      Alert.alert('Could not load script', e instanceof Error ? e.message : 'Unknown error', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    }
  }, [projectId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (!project) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      </Screen>
    );
  }

  const lines = playableLines(project);
  const cast = (project.speakers || []).map((s) => ({
    name: s,
    lines: lines.filter((l) => l.speaker === s).length,
  }));
  const aiSpeaker = (project.speakers || []).find((s) => s !== role) || null;
  const aiAssignment = assigned.find((a) => a.speaker === aiSpeaker);
  const aiVoice: Voice | null =
    (aiAssignment && voices.find((v) => v.voiceId === aiAssignment.voiceId)) ||
    (aiAssignment ? { voiceId: aiAssignment.voiceId, name: aiAssignment.voiceName, description: '' } : null) ||
    voices[0] ||
    null;

  const pickRole = (name: string) => {
    setRole(name);
    Projects.update(projectId, { selectedCharacters: [name] }).catch(() => {});
  };

  const cycleVoice = async () => {
    if (!voices.length || !aiSpeaker) return;
    const idx = aiVoice ? voices.findIndex((v) => v.voiceId === aiVoice.voiceId) : -1;
    const next = voices[(idx + 1) % voices.length];
    try {
      // Re-voicing lines that were already generated costs credits; the server
      // prices it, so ask before committing.
      const price = await Voices.changePrice(projectId, aiSpeaker).catch(() => null);
      if (price && price.milli > 0) {
        const ok = await new Promise<boolean>((resolve) =>
          Alert.alert('Change voice?', `Re-voicing ${aiSpeaker} uses ${price.milli / 1000} credit${price.milli === 1000 ? '' : 's'}.`, [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Change', onPress: () => resolve(true) },
          ], { cancelable: true, onDismiss: () => resolve(false) })
        );
        if (!ok) return;
      }
      await Voices.assign(projectId, aiSpeaker, next.voiceId, next.name);
      setAssigned(await Voices.forProject(projectId).catch(() => assigned));
    } catch (e) {
      Alert.alert('Could not change voice', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const testVoice = async () => {
    if (!aiVoice || testing) return;
    setTesting(true);
    try {
      const sample = lines.find((l) => l.speaker === aiSpeaker)?.text || 'Ready when you are.';
      const res = await Tts.speak({
        text: sample,
        voiceId: aiVoice.voiceId,
        profile: 'baseline',
        speaker: aiSpeaker || undefined,
        sceneTitle: project.title,
      });
      await playBase64(res.audioBase64, res.mimeType, () => setTesting(false));
    } catch (e) {
      setTesting(false);
      if (e instanceof ApiError && e.status === 402) {
        Alert.alert('Voice limit reached', e.message, [
          { text: 'Not now' },
          { text: 'View usage', onPress: () => navigation.navigate('Billing') },
        ]);
      } else {
        Alert.alert('Voice preview failed', e instanceof Error ? e.message : 'Unknown error');
      }
    }
  };

  const playTake = async (takeId: string) => {
    try {
      const { url } = await SelfTapes.downloadUrl(projectId, takeId);
      await WebBrowser.openBrowserAsync(url);
    } catch (e) {
      Alert.alert('Could not open take', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const deleteTake = (takeId: string) =>
    Alert.alert('Delete this take?', 'The video is removed from your library. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await SelfTapes.remove(projectId, takeId);
            setHistory((h) => h.filter((e) => e.id !== takeId));
          } catch (e) {
            Alert.alert('Could not delete take', e instanceof Error ? e.message : 'Unknown error');
          }
        },
      },
    ]);

  const deleteScript = () =>
    Alert.alert('Delete script?', `"${project.title}", its rehearsals and its takes are deleted permanently.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await Projects.remove(projectId);
            navigation.goBack();
          } catch (e) {
            Alert.alert('Could not delete script', e instanceof Error ? e.message : 'Unknown error');
          }
        },
      },
    ]);

  const minutes = Math.max(1, Math.round(lines.length / 6));

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <HeaderAction icon="edit-3" label="Edit lines" onPress={() => navigation.navigate('ScriptEditor', { id: projectId })} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 20, gap: 16 }}>
        <View>
          <Badge variant="soft" label={`${cast.length} ROLES`} />
          <Text style={[styles.title, { color: theme.text }]}>{project.title}</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted }}>
            {lines.length} lines · ~{minutes} min
            {project.sessionCount ? ` · ${project.sessionCount} session${project.sessionCount === 1 ? '' : 's'}` : ''}
          </Text>
        </View>

        <View>
          <Text style={[styles.sectionLabel, { color: theme.text }]}>Choose your role</Text>
          <View style={{ gap: 10 }}>
            {cast.map((r) => {
              const selected = role === r.name;
              return (
                <TouchableOpacity key={r.name} activeOpacity={0.85} onPress={() => pickRole(r.name)}>
                  <Card selected={selected} padding={13} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    {selected ? (
                      <LinearGradient
                        colors={brandGradient}
                        locations={brandGradientLocations}
                        start={diagonalStart}
                        end={diagonalEnd}
                        style={styles.roleAvatar}
                      >
                        <Text style={styles.roleInitials}>{initialsOf(r.name)}</Text>
                      </LinearGradient>
                    ) : (
                      <View style={[styles.roleAvatar, { backgroundColor: theme.surfaceAlt }]}>
                        <Text style={[styles.roleInitials, { color: theme.muted }]}>{initialsOf(r.name)}</Text>
                      </View>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: fonts.bold, fontSize: 14.5, color: theme.text }}>{r.name}</Text>
                      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>
                        {r.lines} lines · {selected ? 'you play this' : 'voiced by AI'}
                      </Text>
                    </View>
                    <View style={[styles.radio, selected ? { backgroundColor: theme.accent } : { borderWidth: 1.5, borderColor: theme.borderStrong }]}>
                      {selected ? <Feather name="check" size={12} color={palette.white} /> : null}
                    </View>
                  </Card>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {aiSpeaker ? (
          <View>
            <View style={styles.rowBetween}>
              <Text style={[styles.sectionLabel, { color: theme.text, marginBottom: 0 }]}>AI voice · {aiSpeaker}</Text>
              <TouchableOpacity onPress={cycleVoice} hitSlop={10} accessibilityRole="button" accessibilityLabel="Change voice">
                <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.accent }}>Change</Text>
              </TouchableOpacity>
            </View>
            <Card padding={13} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
              {/* The AI partner's tile takes the partner cyan, matching the
                  teleprompter's line-ownership colours. */}
              <View style={[styles.voiceIcon, { backgroundColor: theme.tpPartnerBg, borderColor: theme.tpPartner }]}>
                <Feather name="volume-2" size={18} color={theme.tpPartner} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.text }}>
                  {aiVoice ? aiVoice.name : 'No voices available'}
                </Text>
                <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>
                  {aiVoice?.description || '—'}
                </Text>
              </View>
              <TouchableOpacity onPress={testVoice} hitSlop={6} accessibilityRole="button" accessibilityLabel="Test voice" style={[styles.test, { borderColor: theme.accent2 }]}>
                {testing ? (
                  <ActivityIndicator size="small" color={theme.accent2} />
                ) : (
                  <>
                    <Feather name="play" size={12} color={theme.accent2} />
                    <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: theme.accent2 }}>Test</Text>
                  </>
                )}
              </TouchableOpacity>
            </Card>
          </View>
        ) : null}

        {history.length ? (
          <View>
            <Text style={[styles.sectionLabel, { color: theme.text }]}>History · {history.length}</Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted, marginTop: -6, marginBottom: 10 }}>
              Rehearsal scores (0–100) and your saved self-tapes.
            </Text>
            <Card padding={0}>
              {history.slice(0, 12).map((h, i) => {
                const take = h.kind === 'selftape';
                const score = h.confidenceScore;
                const date = new Date(h.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
                return (
                  <TouchableOpacity
                    key={h.id}
                    accessibilityRole="button"
                    accessibilityLabel={take ? `Play self-tape from ${date}` : `Rehearsal results from ${date}`}
                    onPress={() => (take ? void playTake(h.id) : navigation.navigate('SessionResults', { projectId, sessionId: h.id }))}
                    style={[styles.historyRow, i > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }]}
                  >
                    {take ? (
                      <View style={{ width: 44 }}>
                        <Feather name="video" size={20} color={theme.accent} />
                      </View>
                    ) : (
                      <Text style={{ fontFamily: fonts.heavy, fontSize: 18, width: 44, color: score == null ? theme.muted : scoreText(theme, score) }}>
                        {score ?? '—'}
                      </Text>
                    )}
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: theme.text }}>{date}</Text>
                      <Text style={{ fontFamily: fonts.regular, fontSize: 11.5, color: theme.muted }}>
                        {take
                          ? `Self-tape · ${Math.round(h.durationSeconds)}s`
                          : `${h.hasRecording ? 'Recording saved' : 'No recording'} · ${h.completedLines ?? 0} lines`}
                      </Text>
                    </View>
                    {take ? (
                      <TouchableOpacity onPress={() => deleteTake(h.id)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Delete take">
                        <Feather name="trash-2" size={16} color={theme.muted} />
                      </TouchableOpacity>
                    ) : (
                      <Feather name="chevron-right" size={16} color={theme.muted} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </Card>
          </View>
        ) : null}

        <TouchableOpacity onPress={deleteScript} accessibilityRole="button" style={{ alignItems: 'center', minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: theme.destructive }}>Delete script</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.bg }]}>
        <OutlineButton secondary icon="video" label="Studio" onPress={() => navigation.navigate('Studio', { id: projectId })} />
        <GradientButton
          label="Start Rehearsal →"
          style={{ flex: 1 }}
          onPress={() => navigation.navigate('RehearsalRoom', { id: projectId })}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 8 },
  title: { fontFamily: fonts.heavy, fontSize: 29, letterSpacing: -0.7, marginTop: 10, marginBottom: 4 },
  sectionLabel: { fontFamily: fonts.bold, fontSize: 13, marginBottom: 10 },
  roleAvatar: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  roleInitials: { color: palette.white, fontFamily: fonts.bold, fontSize: 13 },
  radio: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 0 },
  voiceIcon: { width: 40, height: 40, borderRadius: radii.tile, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  test: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 14, height: 36, borderRadius: radii.pill, borderWidth: 1, minWidth: 66 },
  footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 24, paddingTop: 14, paddingBottom: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 11 },
});
