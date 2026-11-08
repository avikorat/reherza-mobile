import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import { useBottomTabBarHeight, type BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen, { SCREEN_EDGES_TABS } from '../components/Screen';
import Card from '../components/Card';
import GradientButton from '../components/GradientButton';
import { useToast } from '../components/Toast';
import AccountMenu from '../components/AccountMenu';
import { useTheme } from '../ThemeContext';
import { DemoScenes } from '../api';
import { fonts, radii, palette } from '../theme';
import type { DemoScene, RootStackParamList, TabParamList } from '../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Library'>,
  NativeStackScreenProps<RootStackParamList>
>;

// Same order as the web's filter row; any genre not listed follows.
const GENRE_ORDER = ['Drama', 'Comedy', 'Thriller', 'Romance', 'Sitcom', 'Action', 'Voice Acting', 'Audition Monologues', 'TV Scene', 'Film Scene'];

// The web's /playhouse ("Reherza Library").
export default function PlayhouseScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const toast = useToast();
  const [scenes, setScenes] = useState<DemoScene[] | null>(null);
  const [genre, setGenre] = useState('All');
  const [pending, setPending] = useState<string | null>(null);

  useFocusEffect(useCallback(() => { DemoScenes.list().then(setScenes).catch(() => setScenes([])); }, []));

  const genres = useMemo(() => {
    const present = new Set((scenes ?? []).map((s) => s.genre).filter(Boolean) as string[]);
    return ['All', ...GENRE_ORDER.filter((g) => present.has(g)), ...[...present].filter((g) => !GENRE_ORDER.includes(g))];
  }, [scenes]);
  const filtered = (scenes ?? []).filter((s) => genre === 'All' || s.genre === genre);

  const difficulty: Record<string, { bg: string; fg: string }> = {
    Beginner: { bg: theme.successBg, fg: theme.success },
    Intermediate: { bg: theme.warningBg, fg: theme.warning },
    Advanced: { bg: theme.destructiveBg, fg: theme.destructive },
  };

  const open = async (s: DemoScene) => {
    if (pending) return;
    setPending(s.slug);
    try {
      const project = await DemoScenes.instantiate(s.slug);
      navigation.navigate('ScriptDetail', { id: project.id });
    } catch {
      toast({ title: "Couldn't open that scene, try again", variant: 'destructive' });
    } finally {
      setPending(null);
    }
  };

  return (
    <Screen padded={false} edges={SCREEN_EDGES_TABS}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: tabBarHeight + 24, gap: 14 }}>
        <View>
          <View style={styles.titleRow}>
            <Text style={[styles.h1, { color: theme.text, flex: 1 }]}>Reherza Library</Text>
            <AccountMenu />
          </View>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20, color: theme.muted, marginTop: 4 }}>
            Ready-to-rehearse scenes across every genre. Pick one and you're acting in seconds, voices and all.
          </Text>
        </View>

        {scenes ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {genres.map((g) => {
              const on = g === genre;
              return (
                <TouchableOpacity
                  key={g}
                  onPress={() => setGenre(g)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={[styles.filter, { backgroundColor: on ? theme.accent : theme.surface, borderColor: on ? theme.accent : theme.border }]}
                >
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: on ? palette.white : theme.muted }}>{g}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <ActivityIndicator color={theme.accent} style={{ paddingVertical: 24 }} />
        )}

        {filtered.map((s) => {
          const d = difficulty[s.difficulty || ''] || { bg: theme.surfaceAlt, fg: theme.muted };
          const busy = pending === s.slug;
          return (
            <Card key={s.slug} padding={18} style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View style={[styles.chip, { backgroundColor: theme.accentBg }]}><Text style={[styles.chipText, { color: theme.accent }]}>{s.genre}</Text></View>
                {s.difficulty ? <View style={[styles.chip, { backgroundColor: d.bg }]}><Text style={[styles.chipText, { color: d.fg }]}>{s.difficulty}</Text></View> : null}
              </View>
              <View>
                <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: theme.text, marginBottom: 3 }}>{s.title}</Text>
                <Text numberOfLines={2} style={{ fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: theme.muted }}>{s.synopsis}</Text>
              </View>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>
                {s.characterCount} char{s.characterCount !== 1 ? 's' : ''}  ·  {s.lineCount} lines{s.estimatedDuration ? `  ·  ${s.estimatedDuration}` : ''}
              </Text>
              <GradientButton small label={busy ? 'Setting up…' : 'Open scene'} disabled={!!pending} onPress={() => void open(s)} />
            </Card>
          );
        })}

        {scenes && filtered.length === 0 ? (
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted, textAlign: 'center', paddingVertical: 40 }}>No scenes in this genre yet.</Text>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 26, letterSpacing: -0.6 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  filter: { paddingHorizontal: 14, minHeight: 34, justifyContent: 'center', borderRadius: radii.pill, borderWidth: 1 },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radii.pill },
  chipText: { fontFamily: fonts.semibold, fontSize: 11.5 },
});
