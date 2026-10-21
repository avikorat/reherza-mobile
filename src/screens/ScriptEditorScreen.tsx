import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Badge from '../components/Badge';
import GradientButton from '../components/GradientButton';
import { BackButton, HeaderAction } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { Projects, isMine } from '../api';
import { fonts, radii, palette } from '../theme';
import type { ParsedLine, Project, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ScriptEditor'>;

// The web's who-speaks toggle. Auto follows the character you chose; Me / AI
// pin the line regardless of speaker. The pinned states take the
// teleprompter's ownership colours so the editor and the rehearsal room agree.
type Mode = 'Auto' | 'Me' | 'AI';
const MODES: Mode[] = ['Auto', 'Me', 'AI'];
const LABELS: Record<Mode, string> = { Auto: 'Follows your chosen character', Me: 'I speak this line', AI: 'The AI speaks this line' };

function Segmented({ value, onChange }: { value: Mode; onChange: (mode: Mode) => void }) {
  const { theme } = useTheme();
  return (
    <View style={[styles.seg, { backgroundColor: theme.surfaceAlt }]}>
      {MODES.map((m) => {
        const active = value === m;
        const bg = m === 'Me' ? theme.accent : m === 'AI' ? theme.accent2 : theme.borderStrong;
        return (
          <TouchableOpacity
            key={m}
            onPress={() => onChange(m)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={LABELS[m]}
            style={[styles.segItem, active && { backgroundColor: bg }]}
          >
            <Text style={{ fontFamily: active ? fonts.bold : fonts.semibold, fontSize: 11.5, color: active ? palette.white : theme.muted }} maxFontSizeMultiplier={1.2}>{m}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// The server prices script changes (0 once nothing has been voiced yet).
// Resolves true when there is no charge or the user accepts it.
async function confirmEditCharge(projectId: string, what: string): Promise<boolean> {
  const price = await Projects.editPrice(projectId).catch(() => null);
  if (!price || price.milli <= 0) return true;
  const credits = price.milli / 1000;
  return new Promise((resolve) =>
    Alert.alert(`${what}?`, `This script has been voiced already, so this change uses ${credits} credit${credits === 1 ? '' : 's'}.`, [
      { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
      { text: 'Continue', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) })
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
    setLines((arr) =>
      arr.map((l, idx) => {
        if (idx !== i) return l;
        const { role: _drop, ...rest } = l;
        return mode === 'Auto' ? rest : { ...rest, role: mode === 'Me' ? 'user' : 'ai' };
      })
    );

  const dirty = JSON.stringify(lines) !== JSON.stringify(project?.parsedLines || []);

  const save = async (thenRehearse: boolean) => {
    if (dirty && !(await confirmEditCharge(projectId, 'Save changes'))) return;
    setSaving(true);
    try {
      const speakers = project?.speakers?.length
        ? project.speakers
        : [...new Set(lines.map((l) => l.speaker))];
      if (dirty) await Projects.update(projectId, { parsedLines: lines, speakers });
      if (thenRehearse) navigation.replace('RehearsalRoom', { id: projectId });
      else navigation.goBack();
    } catch (e) {
      Alert.alert('Could not save', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  // Deletes on the server straight away (the server renumbers lines, and each
  // write is its own charge), then carries unsaved Me/AI pins across by position.
  const deleteLine = (line: ParsedLine) =>
    Alert.alert('Delete this line?', `${line.speaker}: “${line.text.slice(0, 80)}${line.text.length > 80 ? '…' : ''}”`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (!project || !(await confirmEditCharge(projectId, 'Delete this line'))) return;
          try {
            const updated = await Projects.bulkDeleteLines(projectId, [line.lineIndex], project.parsedLines.length);
            const kept = lines.filter((l) => l.lineIndex !== line.lineIndex);
            setProject(updated);
            setLines(
              kept.length === updated.parsedLines.length
                ? updated.parsedLines.map((l, i) => {
                    const { role: _drop, ...rest } = l;
                    return kept[i].role ? { ...rest, role: kept[i].role } : rest;
                  })
                : updated.parsedLines
            );
          } catch (e) {
            Alert.alert('Could not delete line', e instanceof Error ? e.message : 'Unknown error');
          }
        },
      },
    ]);

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
        <HeaderAction icon="refresh-cw" label="Reprocess" onPress={reprocess} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 22, paddingBottom: 20, gap: 10 }}>
        <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted, marginBottom: 2 }}>
          Auto follows the character you chose. Pin a line with Me or AI to override it. Tinted lines are yours in the rehearsal room.
        </Text>

        {lines.map((line, i) => {
          const mine = isMine(line, { ...project, parsedLines: lines });
          return (
            <Card key={`${line.lineIndex ?? i}`} selected={mine} padding={13}>
              <View style={styles.lineHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 }}>
                  <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 12, letterSpacing: 0.4, color: mine ? theme.tpYou : theme.tpPartner, flexShrink: 1 }}>
                    {line.speaker}
                  </Text>
                  {line.emotion ? <Badge variant={mine ? 'soft' : 'outline'} label={line.emotion} /> : null}
                </View>
                <Segmented value={line.role === 'user' ? 'Me' : line.role === 'ai' ? 'AI' : 'Auto'} onChange={(m) => setLineRole(i, m)} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                <Text style={{ fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: theme.text, flex: 1 }}>{line.text}</Text>
                <TouchableOpacity onPress={() => deleteLine(line)} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Delete line ${i + 1}`}>
                  <Feather name="trash-2" size={15} color={theme.muted} />
                </TouchableOpacity>
              </View>
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
  seg: { flexDirection: 'row', borderRadius: radii.pill, padding: 3 },
  segItem: { paddingHorizontal: 10, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill },
  footer: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 8 },
});
