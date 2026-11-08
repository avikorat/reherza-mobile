import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Image, RefreshControl } from 'react-native';
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import { useBottomTabBarHeight, type BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen, { SCREEN_EDGES_TABS } from '../components/Screen';
import Card from '../components/Card';
import GradientButton from '../components/GradientButton';
import { useTheme } from '../ThemeContext';
import { History } from '../api';
import AccountMenu from '../components/AccountMenu';
import { formatScriptTitle } from '../lib/format';
import { fonts, radii } from '../theme';
import type { HistoryResponse, HistoryScript, RootStackParamList, TabParamList } from '../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'History'>,
  NativeStackScreenProps<RootStackParamList>
>;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

function countLabel(rehearsals: number, selftapes: number): string {
  const parts: string[] = [];
  if (rehearsals > 0) parts.push(plural(rehearsals, 'rehearsal'));
  if (selftapes > 0) parts.push(plural(selftapes, 'self-tape'));
  return parts.join(' · ');
}

// The web's /history: one tile per script the user has recorded against.
export default function HistoryScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(
    () =>
      History.list()
        .then((d) => { setData(d); setFailed(false); })
        .catch(() => setFailed(true)),
    []
  );
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  const Tile = ({ s }: { s: HistoryScript }) => {
    const title = formatScriptTitle(s.title);
    return (
      <Card padding={0} style={{ overflow: 'hidden' }}>
        <TouchableOpacity activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`${title} history`} onPress={() => navigation.navigate('HistoryScript', { id: s.projectId })}>
          <View style={[styles.media, { backgroundColor: theme.accentBg }]}>
            {s.thumbnailUrl ? (
              <Image source={{ uri: s.thumbnailUrl }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            ) : (
              <Text numberOfLines={3} style={{ fontFamily: fonts.bold, fontSize: 17, textAlign: 'center', color: theme.text, opacity: 0.7, paddingHorizontal: 20 }}>{title}</Text>
            )}
          </View>
        </TouchableOpacity>
        <View style={{ padding: 14, gap: 3 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.text }}>{title}</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 11.5, color: theme.muted }}>{countLabel(s.rehearsalCount, s.selftapeCount)}</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 11.5, color: theme.muted, marginTop: 6 }}>
            Last recorded {new Date(s.lastActivityAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </Text>
          {s.projectExists ? (
            <TouchableOpacity onPress={() => navigation.navigate('ScriptDetail', { id: s.projectId })} accessibilityRole="link" style={{ minHeight: 32, justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: theme.accent }}>Open script →</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </Card>
    );
  };

  return (
    <Screen padded={false} edges={SCREEN_EDGES_TABS}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: tabBarHeight + 24, gap: 14 }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={theme.accent} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
      >
        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text style={[styles.h1, { color: theme.text, flex: 1 }]}>History</Text>
            <AccountMenu />
          </View>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted, marginTop: 4 }}>
            {plural(data?.totalRehearsals ?? 0, 'rehearsal')}  ·  {plural(data?.totalSelftapes ?? 0, 'self-tape')}
          </Text>
        </View>

        {/* A failed request must never read as "nothing recorded yet". */}
        {failed && !data ? (
          <Card style={{ alignItems: 'center' }} padding={24}>
            <Text style={[styles.h3, { color: theme.text }]}>Couldn't load your history</Text>
            <Text style={[styles.body, { color: theme.muted }]}>Your recordings are safe — we just couldn't fetch the list. Please try again.</Text>
            <GradientButton small label="Try again" onPress={() => void load()} style={{ marginTop: 14 }} />
          </Card>
        ) : !data ? (
          <ActivityIndicator color={theme.accent} style={{ paddingVertical: 24 }} />
        ) : data.scripts.length === 0 ? (
          <Card style={{ alignItems: 'center' }} padding={24}>
            <Text style={[styles.h3, { color: theme.text }]}>Nothing recorded yet</Text>
            <Text style={[styles.body, { color: theme.muted }]}>Rehearsals you save and self-tapes you record will appear here, one tile per script.</Text>
            <GradientButton small label="Go to my scripts" onPress={() => navigation.navigate('Main', { screen: 'Home' })} style={{ marginTop: 14 }} />
          </Card>
        ) : (
          data.scripts.map((s) => <Tile key={s.projectId} s={s} />)
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 26, letterSpacing: -0.6 },
  h3: { fontFamily: fonts.bold, fontSize: 17, textAlign: 'center' },
  body: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 4 },
  media: { aspectRatio: 16 / 9, width: '100%', alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: radii.card, borderTopRightRadius: radii.card },
});
