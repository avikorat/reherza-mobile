import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import { useBottomTabBarHeight, type BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen, { SCREEN_EDGES_TABS } from '../components/Screen';
import Card from '../components/Card';
import GradientButton from '../components/GradientButton';
import OutlineButton from '../components/OutlineButton';
import UsageMeter from '../components/UsageMeter';
import Onboarding, { useOnboarding } from '../components/Onboarding';
import { MiniParseProgress } from '../components/ParseProgress';
import { useToast } from '../components/Toast';
import { Logo } from '../components/Bits';
import AccountMenu from '../components/AccountMenu';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import { Dashboard, Feedback, Projects, Usage } from '../api';
import { formatScriptTitle, isAllowanceFailure, spokenDialogueCount } from '../lib/format';
import { fonts, radii, PRESS_OPACITY } from '../theme';
import type { Project, RootStackParamList, TabParamList, UsageInfo } from '../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

// The feedback prompt is asked at most once per app launch; the server decides
// whether it is due at all (and stops asking once answered or dismissed).
let feedbackAsked = false;

// The web's /dashboard, top to bottom: title and actions, usage meter, stats,
// the needs-attention band for failed imports, the script cards, and the
// empty state with the script-format example.
export default function HomeScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const { user } = useAuth();
  const toast = useToast();
  const onboarding = useOnboarding();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [stats, setStats] = useState<{ totalProjects: number; totalSessions: number; totalLinesRehearsed: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [showAllAttention, setShowAllAttention] = useState(false);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [p, u] = await Promise.all([Projects.list(), Usage.me().catch(() => null)]);
      setProjects(p);
      setUsage(u);
      Dashboard.summary().then(setStats).catch(() => {});
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your scripts.');
      setProjects((prev) => prev ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
      if (!feedbackAsked) {
        Feedback.eligibility()
          .then((e) => {
            if (!e.enabled || !e.shouldPrompt || feedbackAsked) return;
            feedbackAsked = true;
            Alert.alert('Got a minute?', 'Tell us how rehearsing with Reherza is going. It takes about a minute.', [
              { text: 'Not now', style: 'cancel', onPress: () => void Feedback.dismiss() },
              { text: 'Give feedback', onPress: () => navigation.navigate('Feedback', { source: 'prompt' }) },
            ]);
          })
          .catch(() => {});
      }
    }, [load])
  );

  // Poll while anything is still parsing, as the web does (4 s).
  const anyProcessing = (projects || []).some((p) => p.parseStatus === 'processing');
  useEffect(() => {
    if (!anyProcessing) return;
    const id = setInterval(() => { Projects.list().then(setProjects).catch(() => {}); }, 4000);
    return () => clearInterval(id);
  }, [anyProcessing]);

  const overLimit = !!usage?.exceeded;
  const newScriptDisabled = !usage || overLimit;
  const creditsAvailable = !!usage && !usage.exceeded;
  const list = projects || [];
  const needsAttention = list.filter((p) => p.parseStatus === 'failed');
  const grid = list.filter((p) => p.parseStatus !== 'failed');
  const first = (user?.name || '').split(' ')[0];

  const remove = (p: Project) =>
    Alert.alert(`Delete "${formatScriptTitle(p.title)}"?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await Projects.remove(p.id);
            toast({ title: 'Script deleted' });
            void load();
          } catch (e) {
            toast({ title: e instanceof Error ? e.message : "Couldn't delete that script.", variant: 'destructive' });
          }
        },
      },
    ]);

  const retry = async (id: string) => {
    setRetrying(true);
    try {
      await Projects.reprocess(id);
      toast({ title: "Reprocessing… we'll parse it again in the background." });
      void load();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Couldn't start reprocessing. Please try again.", variant: 'destructive' });
      Usage.me().then(setUsage).catch(() => {});
    } finally {
      setRetrying(false);
    }
  };

  const newScript = () =>
    newScriptDisabled
      ? toast({ title: overLimit ? 'You are out of credits for this month' : 'Checking your credits…' })
      : navigation.navigate('NewScript');

  const shownAttention = showAllAttention ? needsAttention : needsAttention.slice(0, 3);

  return (
    <Screen padded={false} edges={SCREEN_EDGES_TABS}>
      <View style={styles.topbar}>
        <Logo size={17} />
        <AccountMenu />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: tabBarHeight + 24, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={theme.accent} />}
      >
        <View>
          <Text style={[styles.title, { color: theme.text }]}>My Dashboard</Text>
          <Text style={[styles.sub, { color: theme.muted }]}>Welcome back{first ? `, ${first}` : ''}. Ready to rehearse?</Text>
        </View>

        {/* Two secondaries split one row; the primary takes the row below, as
            the web lays them out on a phone. */}
        <View style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <OutlineButton icon="clock" label="History" small flex onPress={() => navigation.navigate('Main', { screen: 'History' })} />
            <OutlineButton icon="book-open" label="Reherza Library" small flex onPress={() => navigation.navigate('Main', { screen: 'Library' })} />
          </View>
          <GradientButton label="+ New Script" disabled={newScriptDisabled} onPress={newScript} style={newScriptDisabled ? { opacity: 0.6 } : undefined} />
        </View>

        <UsageMeter usage={usage} />

        {error ? (
          <Card>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: theme.destructive }}>{error}</Text>
            <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={load} style={{ marginTop: 8, minHeight: 32, justifyContent: 'center' }} accessibilityRole="button">
              <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: theme.accent }}>Try again</Text>
            </TouchableOpacity>
          </Card>
        ) : null}

        {stats && list.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 22, rowGap: 6 }}>
            {[
              { label: 'Scripts', value: list.length },
              { label: 'Sessions', value: stats.totalSessions },
              { label: 'Lines rehearsed', value: stats.totalLinesRehearsed },
            ].map((s) => (
              <View key={s.label} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 7 }}>
                <Text style={{ fontFamily: fonts.heavy, fontSize: 22, color: theme.text }}>{s.value}</Text>
                <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted }}>{s.label}</Text>
              </View>
            ))}
          </View>
        ) : null}

        {projects === null ? (
          <ActivityIndicator color={theme.accent} style={{ paddingVertical: 24 }} />
        ) : list.length === 0 ? (
          <Card padding={24} style={{ alignItems: 'center' }}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.accentBg }]}>
              <Feather name="book-open" size={26} color={theme.accent} />
            </View>
            <Text style={{ fontFamily: fonts.heavy, fontSize: 19, color: theme.text, marginBottom: 6 }}>Your studio is empty</Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20, color: theme.muted, textAlign: 'center', marginBottom: 18 }}>
              Upload a script, choose your character, and start rehearsing with your scene partner.
            </Text>
            <View style={{ gap: 10, alignSelf: 'stretch' }}>
              <GradientButton label="Browse the Reherza Library" onPress={() => navigation.navigate('Main', { screen: 'Library' })} />
              <OutlineButton label="Upload your own script" onPress={newScript} />
            </View>
            <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted, marginTop: 14, textAlign: 'center' }}>
              No script? Start with a ready-made scene from the Reherza Library.
            </Text>
            <View style={{ alignSelf: 'stretch', borderTopWidth: 1, borderTopColor: theme.border, marginTop: 20, paddingTop: 18 }}>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted, marginBottom: 10, textAlign: 'center' }}>Format your script like this:</Text>
              <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: 10, padding: 12, gap: 3 }}>
                {[['MAYA', "I thought you weren't coming."], ['LEO', "I almost didn't."], ['MAYA', 'Then why are you here?']].map(([who, line], i) => (
                  <Text key={i} style={{ fontFamily: fonts.medium, fontSize: 12.5, color: theme.text, opacity: 0.8 }}>
                    <Text style={{ fontFamily: fonts.bold, color: theme.accent }}>{who}:</Text> {line}
                  </Text>
                ))}
              </View>
            </View>
          </Card>
        ) : (
          <>
            {needsAttention.length ? (
              <Card padding={16} style={{ borderLeftWidth: 3, borderLeftColor: theme.warningFill }}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: theme.warning, marginBottom: 2 }}>
                  {needsAttention.length} script{needsAttention.length === 1 ? ' needs' : 's need'} your attention
                </Text>
                {shownAttention.map((p, i) => {
                  const limitStopped = isAllowanceFailure(p.parseErrorCode);
                  const canReprocess = limitStopped && creditsAvailable;
                  return (
                    <View key={p.id} style={[{ paddingVertical: 12, gap: 10 }, i > 0 && { borderTopWidth: 1, borderTopColor: theme.divider }]}>
                      <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={() => navigation.navigate('ScriptDetail', { id: p.id })} accessibilityRole="link">
                        <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.text }}>{formatScriptTitle(p.title)}</Text>
                        <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>
                          {limitStopped
                            ? canReprocess ? 'Parsing paused for credits — you have enough now' : 'Parsing paused — you ran out of credits'
                            : "We couldn't read this file — it may be scanned or image-only"}
                        </Text>
                      </TouchableOpacity>
                      {limitStopped && !canReprocess ? null : (
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                          <GradientButton small label={retrying ? 'Starting…' : canReprocess ? 'Reprocess' : 'Try again'} disabled={retrying} onPress={() => void retry(p.id)} style={{ flex: 1 }} />
                          {!canReprocess ? <OutlineButton small flex label="Enter lines" onPress={() => navigation.navigate('ScriptEditor', { id: p.id })} /> : null}
                        </View>
                      )}
                    </View>
                  );
                })}
                {needsAttention.length > shownAttention.length ? (
                  <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={() => setShowAllAttention(true)} style={{ borderTopWidth: 1, borderTopColor: theme.divider, paddingTop: 10, alignItems: 'center' }} accessibilityRole="button">
                    <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: theme.accent }}>Show {needsAttention.length - shownAttention.length} more</Text>
                  </TouchableOpacity>
                ) : null}
              </Card>
            ) : null}

            {grid.map((p) => {
              const processing = p.parseStatus === 'processing';
              const speakers = p.speakers || [];
              const hasCharacter = !!(p.selectedCharacters?.length || p.selectedCharacter);
              const title = formatScriptTitle(p.title);
              return (
                <Card key={p.id} padding={18} style={{ gap: 10 }}>
                  <TouchableOpacity activeOpacity={PRESS_OPACITY}
                    onPress={() => remove(p)}
                    accessibilityRole="button"
                    accessibilityLabel={`Delete ${title}`}
                    hitSlop={8}
                    style={styles.delete}
                  >
                    <Text style={{ fontSize: 18, lineHeight: 20, color: theme.muted }}>×</Text>
                  </TouchableOpacity>
                  <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={() => navigation.navigate('ScriptDetail', { id: p.id })} accessibilityRole="link">
                    <Text numberOfLines={2} style={{ fontFamily: fonts.bold, fontSize: 16, lineHeight: 21, color: theme.text, paddingRight: 28, marginBottom: 6 }}>{title}</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
                      {processing ? (
                        <View style={[styles.chip, { backgroundColor: theme.warningBg }]}>
                          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.warning }} />
                          <Text style={[styles.chipText, { color: theme.warning }]}>Processing…</Text>
                        </View>
                      ) : (
                        <>
                          {hasCharacter ? (
                            <View style={[styles.chip, { backgroundColor: theme.accentBg }]}>
                              <Text style={[styles.chipText, { color: theme.accent }]}>
                                {(p.selectedCharacters?.length ?? 0) > 1 ? p.selectedCharacters!.join(' & ') : p.selectedCharacters?.[0] || p.selectedCharacter}
                              </Text>
                            </View>
                          ) : null}
                          <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>
                            {speakers.length} char{speakers.length !== 1 ? 's' : ''} · {spokenDialogueCount(p.parsedLines)} lines
                          </Text>
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                  {processing ? <MiniParseProgress startedAt={p.parseStartedAt} /> : null}
                  {!processing && (p.sessionCount ?? 0) > 0 ? (
                    <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={() => navigation.navigate('Main', { screen: 'History' })} accessibilityRole="link" style={{ alignSelf: 'flex-start', minHeight: 28, justifyContent: 'center' }}>
                      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>
                        {p.sessionCount} session{p.sessionCount !== 1 ? 's' : ''} · view history
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                  {processing ? (
                    <OutlineButton small label="Parsing…" onPress={undefined} style={{ opacity: 0.6 }} />
                  ) : !hasCharacter ? (
                    <OutlineButton small label="Set up" onPress={() => navigation.navigate('ScriptDetail', { id: p.id })} />
                  ) : null}
                </Card>
              );
            })}
          </>
        )}

        <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={onboarding.reopen} accessibilityRole="button" style={{ alignSelf: 'center', minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: theme.muted }}>How it works</Text>
        </TouchableOpacity>
      </ScrollView>

      <Onboarding open={onboarding.open} onClose={onboarding.dismiss} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 10 },
  title: { fontFamily: fonts.heavy, fontSize: 27, letterSpacing: -0.6 },
  sub: { fontFamily: fonts.regular, fontSize: 13.5, marginTop: 4 },
  emptyIcon: { width: 64, height: 64, borderRadius: radii.cardSm, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radii.pill },
  chipText: { fontFamily: fonts.semibold, fontSize: 11.5 },
  delete: { position: 'absolute', top: 6, right: 6, zIndex: 1, width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
});
