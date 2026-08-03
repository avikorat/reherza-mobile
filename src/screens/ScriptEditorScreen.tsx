import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Badge from '../components/Badge';
import GradientButton from '../components/GradientButton';
import { BackButton } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { Projects } from '../api';
import { fonts, radii } from '../theme';
import type { ParsedLine, Project, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ScriptEditor'>;

type Mode = 'AI' | 'Me';
const MODES: Mode[] = ['AI', 'Me'];

function Segmented({ value, onChange }: { value: Mode; onChange: (mode: Mode) => void }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.seg, { backgroundColor: theme.bg }]}>
      {MODES.map((m) => {
        const active = value === m;
        const bg = m === 'Me' ? theme.accent : theme.text;
        return (
          <TouchableOpacity key={m} onPress={() => onChange(m)} style={[styles.segItem, active && { backgroundColor: bg }]}>
            <Text style={{ fontFamily: active ? fonts.bold : fonts.semibold, fontSize: 10, color: active ? '#fff' : theme.muted }}>{m}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export default function ScriptEditorScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const projectId = route.params.id;
  const [project, setProject] = useState<Project | null>(null);
  const [lines, setLines] = useState<ParsedLine[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const p = await Projects.get(projectId);
        setProject(p);
        setLines(p.parsedLines || []);
      } catch (e) {
        Alert.alert('Could not load script', e instanceof Error ? e.message : 'Unknown error', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    })();
  }, [projectId]);

  const setLineRole = (i: number, mode: Mode) =>
    setLines((arr) => arr.map((l, idx) => (idx === i ? { ...l, role: mode === 'Me' ? 'user' : 'ai' } : l)));

  const save = async (thenRehearse: boolean) => {
    setSaving(true);
    try {
      const speakers = project?.speakers?.length
        ? project.speakers
        : [...new Set(lines.map((l) => l.speaker))];
      await Projects.update(projectId, { parsedLines: lines, speakers });
      if (thenRehearse) navigation.replace('RehearsalRoom', { id: projectId });
      else navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  const reprocess = () => {
    Alert.alert('Reprocess script', 'Re-run AI parsing on the original text? Your line edits will be replaced.', [
      { text: 'Cancel' },
      {
        text: 'Reprocess',
        style: 'destructive',
        onPress: async () => {
          try {
            await Projects.reprocess(projectId);
            navigation.replace('Parsing', { id: projectId });
          } catch (e) {
            Alert.alert('Could not reprocess', e instanceof Error ? e.message : 'Unknown error');
          }
        },
      },
    ]);
  };

  if (!project) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.accent} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: theme.text }}>Edit lines</Text>
        <TouchableOpacity onPress={reprocess}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: theme.accent }}>Reprocess</Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 20, gap: 10 }}>
        <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginBottom: 2 }}>
          Set who speaks each turn. "Me" lines are yours in the rehearsal room.
        </Text>

        {lines.map((line, i) => {
          const mine = line.role === 'user';
          return (
            <Card key={`${line.lineIndex ?? i}`} selected={mine} padding={13}>
              <View style={styles.lineHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                  <Text numberOfLines={1} style={{ fontFamily: fonts.heavy, fontSize: 12, letterSpacing: 0.4, color: mine ? theme.accent : theme.muted, maxWidth: 130 }}>
                    {line.speaker}
                  </Text>
                  {line.emotion ? <Badge variant={mine ? 'soft' : 'outline'} label={line.emotion} /> : null}
                </View>
                <Segmented value={mine ? 'Me' : 'AI'} onChange={(m) => setLineRole(i, m)} />
              </View>
              <Text style={{ fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: theme.text }}>{line.text}</Text>
            </Card>
          );
        })}
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: theme.bg }]}>
        {saving ? (
          <View style={{ paddingVertical: 16, alignItems: 'center' }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <GradientButton label="Save & Start Rehearsal →" onPress={() => save(true)} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22, paddingVertical: 8, marginBottom: 4 },
  lineHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 },
  seg: { flexDirection: 'row', borderRadius: radii.pill, padding: 2 },
  segItem: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: radii.pill },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 8 },
});
