import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Badge from '../components/Badge';
import GradientButton from '../components/GradientButton';
import OutlineButton from '../components/OutlineButton';
import { Logo, Avatar, ProgressBar } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import { Projects, Usage, playableLines } from '../api';
import { fonts } from '../theme';
import type { Project, RootStackParamList, TabParamList, UsageInfo } from '../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

function initialsOf(name?: string): string {
  return (name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function HomeScreen({ navigation }: Props) {
  const { theme, toggle } = useTheme();
  const { user } = useAuth();
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const [p, u] = await Promise.all([Projects.list(), Usage.me().catch(() => null)]);
      setProjects(p);
      setUsage(u);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load your studio.');
      setProjects((prev) => prev ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const first = (user?.name || 'Friend').split(' ')[0];
  const list = projects || [];
  const sessions = list.reduce((n, p) => n + (p.sessionCount || 0), 0);
  const lineCount = list.reduce((n, p) => n + playableLines(p).length, 0);
  const inRehearsal = list.filter((p) => (p.sessionCount || 0) > 0).length;
  const usagePct = usage && usage.charLimit ? Math.min(1, usage.charsUsed / usage.charLimit) : 0;

  const statusBadge = (p: Project) => {
    if (p.parseStatus === 'processing') return <Badge variant="soft" label="Parsing…" />;
    if (p.parseStatus === 'failed') return <Badge variant="soft" label="Failed" />;
    return <Badge variant="success" label="● Ready" />;
  };

  return (
    <Screen padded={false}>
      <View style={styles.topbar}>
        <Logo size={17} />
        {/* Tap the avatar to switch Paper / Stage theme (Appearance in settings). */}
        <TouchableOpacity onPress={toggle} activeOpacity={0.8} accessibilityRole="button" accessibilityLabel="Switch theme">
          <Avatar initials={initialsOf(user?.name)} size={40} />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 110, gap: 16 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.accent} />}
      >
        <View>
          <Text style={[styles.greet, { color: theme.muted }]}>{greeting()}, {first}</Text>
          <Text style={[styles.title, { color: theme.text }]}>{first}'s Studio</Text>
          <Text style={[styles.sub, { color: theme.muted }]}>
            {list.length} script{list.length === 1 ? '' : 's'} · {inRehearsal} in rehearsal
          </Text>
        </View>

        {error ? (
          <Card>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: theme.accent }}>{error}</Text>
            <TouchableOpacity onPress={load} style={{ marginTop: 8 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: theme.accent }}>Retry</Text>
            </TouchableOpacity>
          </Card>
        ) : null}

        {usage ? (
          <Card>
            <View style={styles.rowBetween}>
              <Text style={[styles.cardLabel, { color: theme.text }]}>Voice credits</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>
                <Text style={{ fontFamily: fonts.serif, fontSize: 15, color: theme.text }}>
                  {Math.round(usage.charsUsed / 1000)}k
                </Text>{' '}
                / {Math.round((usage.charLimit || 0) / 1000)}k chars
              </Text>
            </View>
            <View style={{ marginTop: 11 }}>
              <ProgressBar progress={usagePct} />
            </View>
            <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: theme.muted, marginTop: 9 }}>
              {usage.analysisLimit != null
                ? `${usage.analysesUsed} / ${usage.analysisLimit} analyses used · `
                : ''}
              <Text
                style={{ color: theme.accent, fontFamily: fonts.semibold }}
                onPress={() => navigation.navigate('Billing')}
              >
                {usage.exceeded ? 'Limit reached — upgrade' : 'Upgrade'}
              </Text>
            </Text>
          </Card>
        ) : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          {[
            { n: String(list.length), l: 'SCRIPTS' },
            { n: String(sessions), l: 'SESSIONS' },
            { n: lineCount.toLocaleString(), l: 'LINES' },
          ].map((s) => (
            <Card key={s.l} style={{ flex: 1 }} padding={13}>
              <Text style={[styles.stat, { color: theme.text }]}>{s.n}</Text>
              <Text style={[styles.statLabel, { color: theme.muted }]}>{s.l}</Text>
            </Card>
          ))}
        </View>

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <GradientButton label="+ New Script" small style={{ flex: 1 }} onPress={() => navigation.navigate('NewScript')} />
          <OutlineButton label="🎭 Playhouse" small flex onPress={() => navigation.navigate('Playhouse')} />
        </View>

        <View style={[styles.rowBetween, { marginTop: 2 }]}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>Your scripts</Text>
        </View>

        {projects === null ? (
          <View style={{ paddingVertical: 24, alignItems: 'center' }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : list.length === 0 ? (
          <Card>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.text, marginBottom: 4 }}>
              No scripts yet
            </Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted, lineHeight: 19 }}>
              Import a script or grab a ready-made scene from the Playhouse to start rehearsing.
            </Text>
          </Card>
        ) : (
          <View style={{ gap: 10 }}>
            {list.map((p) => (
              <TouchableOpacity
                key={p.id}
                activeOpacity={0.85}
                onPress={() =>
                  p.parseStatus === 'processing'
                    ? navigation.navigate('Parsing', { id: p.id })
                    : navigation.navigate('ScriptDetail', { id: p.id })
                }
              >
                <Card style={styles.scriptRow} padding={14}>
                  <LinearGradient
                    colors={theme.key === 'stage' ? ['#3a3129', '#0E0B09'] : ['#2b2622', '#16110C']}
                    style={styles.cover}
                  >
                    <View style={styles.coverDot} />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.scriptTitle, { color: theme.text }]} numberOfLines={1}>{p.title}</Text>
                    <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginTop: 1 }} numberOfLines={1}>
                      {p.selectedCharacters?.length || p.selectedCharacter
                        ? `as ${(p.selectedCharacters || [p.selectedCharacter]).join(', ')} · `
                        : ''}
                      {(p.speakers || []).length} roles
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 5 }}>
                    {statusBadge(p)}
                    <Feather name="chevron-right" size={18} color={theme.muted} />
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingVertical: 12,
  },
  greet: { fontFamily: fonts.regular, fontSize: 14, marginBottom: 2 },
  title: { fontFamily: fonts.heavy, fontSize: 28, letterSpacing: -0.9 },
  sub: { fontFamily: fonts.regular, fontSize: 13, marginTop: 4 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLabel: { fontFamily: fonts.bold, fontSize: 13 },
  stat: { fontFamily: fonts.serifBold, fontSize: 24, textAlign: 'center' },
  statLabel: { fontFamily: fonts.semibold, fontSize: 10.5, letterSpacing: 0.4, textAlign: 'center', marginTop: 1 },
  sectionTitle: { fontFamily: fonts.bold, fontSize: 15 },
  scriptRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  cover: { width: 44, height: 56, borderRadius: 8, justifyContent: 'flex-end', padding: 6 },
  coverDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: '#FF0000' },
  scriptTitle: { fontFamily: fonts.bold, fontSize: 15 },
});
