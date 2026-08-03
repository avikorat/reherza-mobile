import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Badge from '../components/Badge';
import { useTheme } from '../ThemeContext';
import { Projects, myCharacters, playableLines } from '../api';
import { fonts, warmGradient } from '../theme';
import type { Project, RootStackParamList, TabParamList } from '../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Rehearse'>,
  NativeStackScreenProps<RootStackParamList>
>;

// The Rehearse tab: a launcher for jumping straight into a scene.
export default function RehearseScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [projects, setProjects] = useState<Project[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      Projects.list()
        .then(setProjects)
        .catch(() => setProjects([]));
    }, [])
  );

  const ready = (projects || []).filter((p) => p.parseStatus === 'ready');

  return (
    <Screen padded={false}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 110, gap: 16 }}
      >
        <View>
          <Text style={[styles.h1, { color: theme.text }]}>Rehearse</Text>
          <Text style={[styles.sub, { color: theme.muted }]}>Pick a script and step into the room.</Text>
        </View>

        {projects === null ? (
          <View style={{ paddingVertical: 30, alignItems: 'center' }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : ready.length === 0 ? (
          <Card>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.text, marginBottom: 4 }}>
              Nothing ready to rehearse
            </Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted, lineHeight: 19 }}>
              Import a script or open a Playhouse scene first.
            </Text>
          </Card>
        ) : (
          ready.map((p) => {
            const lines = playableLines(p);
            const mine = myCharacters(p);
            const minutes = Math.max(1, Math.round(lines.length / 6));
            return (
              <TouchableOpacity key={p.id} activeOpacity={0.9} onPress={() => navigation.navigate('RehearsalRoom', { id: p.id })}>
                <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                  <LinearGradient colors={warmGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.icon}>
                    <Feather name="mic" size={20} color="#fff" />
                  </LinearGradient>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>{p.title}</Text>
                    <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginTop: 2 }} numberOfLines={1}>
                      {mine.length ? `as ${mine.join(', ')} · ` : ''}{lines.length} lines · ~{minutes} min
                    </Text>
                  </View>
                  <Badge variant="success" label="● Ready" />
                </Card>
              </TouchableOpacity>
            );
          })
        )}

        <Text style={[styles.hint, { color: theme.muted }]}>
          Rehearsals run line-by-line with your AI scene partner. It speaks its lines aloud; when it's
          your turn, Reherza listens and checks your delivery against the script.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 28, letterSpacing: -0.9, marginTop: 6, marginBottom: 3 },
  sub: { fontFamily: fonts.regular, fontSize: 13.5 },
  icon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.bold, fontSize: 16 },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 19, marginTop: 4 },
});
