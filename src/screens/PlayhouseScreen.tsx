import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import type { CompositeScreenProps } from '@react-navigation/native';
import { useBottomTabBarHeight, type BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen, { SCREEN_EDGES_TABS } from '../components/Screen';
import Card from '../components/Card';
import Badge from '../components/Badge';
import { useTheme } from '../ThemeContext';
import { DemoScenes } from '../api';
import { fonts, radii, palette } from '../theme';
import type { DemoScene, RootStackParamList, TabParamList } from '../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Playhouse'>,
  NativeStackScreenProps<RootStackParamList>
>;

export default function PlayhouseScreen({ navigation }: Props) {
  const { theme } = useTheme();
  // The tab bar floats over the screen, so scroll content has to end above
  // it. This is the bar's real height (content + the device's bottom inset),
  // so it can't drift from the navigator's own config.
  const tabBarHeight = useBottomTabBarHeight();
  const [scenes, setScenes] = useState<DemoScene[] | null>(null);
  const [filter, setFilter] = useState('All');
  const [opening, setOpening] = useState<string | null>(null); // slug being instantiated
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setError(null);
      setScenes(await DemoScenes.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load scenes.');
      setScenes([]);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const genres = ['All', ...new Set((scenes || []).map((s) => s.genre).filter((g): g is string => Boolean(g)))];
  const list = (scenes || []).filter((s) => filter === 'All' || s.genre === filter);

  const open = async (scene: DemoScene) => {
    if (opening) return;
    setOpening(scene.slug);
    try {
      const project = await DemoScenes.instantiate(scene.slug);
      navigation.navigate('ScriptDetail', { id: project.id });
    } catch (e) {
      Alert.alert('Could not open scene', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setOpening(null);
    }
  };

  return (
    <Screen padded={false} edges={SCREEN_EDGES_TABS}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: tabBarHeight + 24, gap: 14 }}
      >
        <View>
          <Text style={[styles.h1, { color: theme.text }]}>Playhouse</Text>
          <Text style={[styles.sub, { color: theme.muted }]}>Ready-to-rehearse scenes. Pick one and go.</Text>
        </View>

        {scenes === null ? (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {genres.map((g) => {
                const active = g === filter;
                return (
                  <TouchableOpacity
                    key={g}
                    activeOpacity={0.8}
                    onPress={() => setFilter(g)}
                    style={[
                      styles.chip,
                      active
                        ? { backgroundColor: theme.accent, borderColor: theme.accent }
                        : { backgroundColor: theme.surface, borderColor: theme.border },
                    ]}
                  >
                    <Text style={{ fontFamily: active ? fonts.bold : fonts.semibold, fontSize: 12.5, color: active ? palette.white : theme.muted }}>
                      {g}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {error ? (
              <Card>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: theme.destructive }}>{error}</Text>
                <TouchableOpacity onPress={load} style={{ marginTop: 8 }}>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: theme.accent }}>Retry</Text>
                </TouchableOpacity>
              </Card>
            ) : null}

            {list.map((s) => (
              <TouchableOpacity key={s.slug} activeOpacity={0.9} onPress={() => open(s)} disabled={Boolean(opening)}>
                <Card>
                  <View style={{ flexDirection: 'row', gap: 7, marginBottom: 10 }}>
                    {/* Genre is a taxonomy, not a status — every genre takes the
                        same brand tint rather than borrowing success/warning,
                        which would read as "this scene passed/failed". */}
                    <Badge variant="soft" label={(s.genre || 'SCENE').toUpperCase()} />
                    {s.difficulty ? <Badge variant="outline" label={s.difficulty} /> : null}
                  </View>
                  <Text style={[styles.cardTitle, { color: theme.text }]}>{s.title}</Text>
                  <Text style={[styles.blurb, { color: theme.muted }]}>{s.synopsis}</Text>
                  <View style={styles.footer}>
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.muted }}>
                      {s.characterCount} chars · {s.lineCount} lines · {s.estimatedDuration}
                    </Text>
                    {opening === s.slug ? (
                      <ActivityIndicator size="small" color={theme.accent} />
                    ) : (
                      <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: theme.accent }}>Open scene →</Text>
                    )}
                  </View>
                </Card>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 28, letterSpacing: -0.6, marginTop: 6, marginBottom: 3 },
  sub: { fontFamily: fonts.regular, fontSize: 13.5 },
  chip: { paddingHorizontal: 15, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 1 },
  cardTitle: { fontFamily: fonts.bold, fontSize: 19, letterSpacing: -0.3, marginBottom: 4 },
  blurb: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, marginBottom: 12 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
