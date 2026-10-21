import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Card from '../components/Card';
import { BackButton } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { History } from '../api';
import { fonts } from '../theme';
import type { HistoryResponse, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'History'>;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// Every script the user has rehearsed or taped against. A script's own
// rehearsals and takes (play, delete) live on its Script Detail.
export default function HistoryScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      History.list()
        .then((d) => { setData(d); setError(null); })
        .catch((e) => setError(e instanceof Error ? e.message : 'Could not load your history.'));
    }, [])
  );

  return (
    <Screen padded={false}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 40, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <BackButton onPress={() => navigation.goBack()} />
          <Text style={[styles.h1, { color: theme.text }]}>Recording history</Text>
        </View>

        {error ? <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: theme.destructive }}>{error}</Text> : null}

        {!data && !error ? (
          <ActivityIndicator color={theme.accent} style={{ paddingVertical: 24 }} />
        ) : data && !data.scripts.length ? (
          <Card>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.text }}>Nothing recorded yet</Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted, marginTop: 4 }}>
              Rehearsals and self-tapes you save show up here.
            </Text>
          </Card>
        ) : data ? (
          <>
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted }}>
              {plural(data.totalRehearsals, 'rehearsal')} · {plural(data.totalSelftapes, 'self-tape')}
            </Text>
            {data.scripts.map((s) => (
              <TouchableOpacity
                key={s.projectId}
                activeOpacity={s.projectExists ? 0.85 : 1}
                disabled={!s.projectExists}
                accessibilityRole="button"
                onPress={() => navigation.navigate('ScriptDetail', { id: s.projectId })}
              >
                <Card padding={14} style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: theme.text }} numberOfLines={1}>{s.title}</Text>
                    <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted, marginTop: 2 }}>
                      {plural(s.rehearsalCount, 'rehearsal')} · {plural(s.selftapeCount, 'self-tape')} ·{' '}
                      {s.projectExists ? new Date(s.lastActivityAt).toLocaleDateString() : 'script deleted'}
                    </Text>
                  </View>
                  {s.projectExists ? <Feather name="chevron-right" size={18} color={theme.muted} /> : null}
                </Card>
              </TouchableOpacity>
            ))}
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 24, letterSpacing: -0.5 },
});
