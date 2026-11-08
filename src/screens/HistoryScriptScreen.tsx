import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Card from '../components/Card';
import GradientButton from '../components/GradientButton';
import OutlineButton from '../components/OutlineButton';
import { BackButton } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { History, SelfTapes, Sessions } from '../api';
import { formatScriptTitle } from '../lib/format';
import { fonts } from '../theme';
import type { HistoryDetail, HistoryEntry, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'HistoryScript'>;

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  return `${m}:${String(Math.round(seconds % 60)).padStart(2, '0')}`;
}

const longDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

function TapePlayer({ url }: { url: string }) {
  const player = useVideoPlayer({ uri: url });
  return <VideoView player={player} style={styles.video} nativeControls contentFit="contain" />;
}

// The web's /history/:id — every rehearsal and self-tape recorded against one
// script, with play, download (share sheet on a phone) and delete.
export default function HistoryScriptScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const projectId = route.params.id;
  const [data, setData] = useState<HistoryDetail | null>(null);
  const [failed, setFailed] = useState(false);
  const [tapeUrls, setTapeUrls] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(
    () =>
      History.forProject(projectId)
        .then((d) => { setData(d); setFailed(false); })
        .catch(() => setFailed(true)),
    [projectId]
  );
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const play = async (e: HistoryEntry) => {
    setBusyId(e.id);
    try {
      const { url } = await SelfTapes.downloadUrl(e.projectId, e.id);
      setTapeUrls((p) => ({ ...p, [e.id]: url }));
    } catch {
      Alert.alert("Couldn't load this self-tape", 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const download = async (e: HistoryEntry) => {
    setBusyId(e.id);
    try {
      const { url } = await SelfTapes.downloadUrl(e.projectId, e.id);
      const ext = e.mimeType?.includes('mp4') ? 'mp4' : e.mimeType?.includes('quicktime') ? 'mov' : 'webm';
      const stamp = new Date(e.createdAt).toISOString().slice(0, 19).replace(/[:T]/g, '-');
      const { uri } = await FileSystem.downloadAsync(url, `${FileSystem.cacheDirectory}reherza-selftape-${stamp}.${ext}`);
      if (!(await Sharing.isAvailableAsync())) throw new Error('unavailable');
      await Sharing.shareAsync(uri, { mimeType: e.mimeType || 'video/mp4' });
    } catch {
      Alert.alert("Couldn't download this self-tape", 'Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = (e: HistoryEntry) => {
    const tape = e.kind === 'selftape';
    const label = tape ? 'self-tape' : 'recording';
    Alert.alert(
      tape ? 'Delete this self-tape?' : 'Delete this recording?',
      tape
        ? `The take from ${longDate(e.createdAt)} will be removed for good. You can't re-shoot it from that day.`
        : `The audio from ${longDate(e.createdAt)} will be removed for good. The rehearsal keeps its date and score — only the recording goes.`,
      [
        { text: 'Keep it', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (tape) await SelfTapes.remove(e.projectId, e.id);
              else await Sessions.deleteRecording(e.projectId, e.id);
              setTapeUrls((p) => { const n = { ...p }; delete n[e.id]; return n; });
              await load();
              Alert.alert(`Deleted this ${label}.`);
            } catch {
              Alert.alert(`Couldn't delete this ${label}`, 'Please try again.');
            }
          },
        },
      ]
    );
  };

  const title = data ? formatScriptTitle(data.title) : '';

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text numberOfLines={1} style={{ flex: 1, fontFamily: fonts.bold, fontSize: 15, color: theme.text }}>{title || 'History'}</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 10 }}>
        {failed && !data ? (
          <Card style={{ alignItems: 'center' }} padding={24}>
            <Text style={[styles.h3, { color: theme.text }]}>Couldn't load this script's history</Text>
            <Text style={[styles.body, { color: theme.muted }]}>It may have been deleted, or the list just failed to load.</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <GradientButton small label="Try again" onPress={() => void load()} />
              <OutlineButton small label="Back to History" onPress={() => navigation.goBack()} />
            </View>
          </Card>
        ) : !data ? (
          <ActivityIndicator color={theme.accent} style={{ paddingVertical: 24 }} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.h1, { color: theme.text }]}>{title}</Text>
                <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted, marginTop: 4 }}>
                  {data.rehearsalCount} rehearsal{data.rehearsalCount === 1 ? '' : 's'}  ·  {data.selftapeCount} self-tape{data.selftapeCount === 1 ? '' : 's'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => navigation.navigate('ScriptDetail', { id: projectId })} accessibilityRole="link" style={{ minHeight: 36, justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: theme.accent }}>Open script →</Text>
              </TouchableOpacity>
            </View>

            {data.entries.length === 0 ? (
              <Card padding={24}><Text style={[styles.body, { color: theme.muted }]}>Nothing recorded against this script yet.</Text></Card>
            ) : null}

            {data.entries.map((e) => {
              const tape = e.kind === 'selftape';
              const url = tapeUrls[e.id];
              const busy = busyId === e.id;
              const when = `${new Date(e.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${new Date(e.createdAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
              return (
                <View key={`${e.kind}-${e.id}`} style={[styles.entry, { borderColor: theme.border }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <View style={{ width: 56, alignItems: 'center' }}>
                      {tape ? (
                        e.thumbnailUrl ? <Image source={{ uri: e.thumbnailUrl }} style={{ width: 56, height: 40, borderRadius: 4 }} /> : <Text style={{ fontSize: 16 }}>🎬</Text>
                      ) : (
                        <>
                          <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: e.confidenceScore != null ? theme.accent : theme.muted }}>{e.confidenceScore ?? '—'}</Text>
                          <Text style={{ fontFamily: fonts.semibold, fontSize: 9, letterSpacing: 0.6, color: theme.muted }}>SCORE</Text>
                        </>
                      )}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: theme.text }}>{when}</Text>
                      <Text style={{ fontFamily: fonts.regular, fontSize: 11.5, color: theme.muted }}>
                        {tape
                          ? `Self-tape · ${formatDuration(e.durationSeconds)}`
                          : `Rehearsal · ${formatDuration(e.durationSeconds)} · ${e.hasRecording ? '🎙 audio saved' : 'no recording'}`}
                      </Text>
                    </View>
                    {tape ? (
                      <>
                        {!url ? (
                          <TouchableOpacity onPress={() => void play(e)} disabled={busy} accessibilityRole="button" style={styles.action}>
                            <Text style={[styles.actionText, { color: theme.accent }]}>{busy ? 'Loading…' : '▶ Play'}</Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity onPress={() => void download(e)} disabled={busy} accessibilityRole="button" accessibilityLabel="Download this self-tape" style={styles.action}>
                          <Text style={[styles.actionText, { color: theme.accent }]}>⬇ Download</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity onPress={() => navigation.navigate('SessionResults', { projectId: e.projectId, sessionId: e.id })} accessibilityRole="button" style={styles.action}>
                        <Text style={[styles.actionText, { color: theme.accent }]}>{e.hasRecording ? '▶ Open' : 'View results'}</Text>
                      </TouchableOpacity>
                    )}
                    {/* A rehearsal with no audio left has nothing to delete. */}
                    {tape || e.hasRecording ? (
                      <TouchableOpacity onPress={() => confirmDelete(e)} accessibilityRole="button" accessibilityLabel={tape ? 'Delete this self-tape' : 'Delete this recording'} style={styles.action}>
                        <Feather name="trash-2" size={16} color={theme.muted} />
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  {url ? <TapePlayer url={url} /> : null}
                </View>
              );
            })}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 8 },
  h1: { fontFamily: fonts.heavy, fontSize: 24, letterSpacing: -0.5 },
  h3: { fontFamily: fonts.bold, fontSize: 17, textAlign: 'center' },
  body: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 4 },
  entry: { borderWidth: 1, borderRadius: 12, padding: 12 },
  action: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontFamily: fonts.bold, fontSize: 12 },
  video: { width: '100%', aspectRatio: 16 / 9, borderRadius: 8, backgroundColor: '#000', marginTop: 10 },
});
