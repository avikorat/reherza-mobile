import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Projects } from '../api';
import { themes, fonts, RED_DOT } from '../theme';
import type { Project, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Parsing'>;

const S = themes.stage; // Parsing is always the theatrical dark mood.

type StepState = 'done' | 'active' | 'pending';

export default function ParsingScreen({ navigation, route }: Props) {
  const projectId = route.params.id;
  const spin = useRef(new Animated.Value(0)).current;
  const [project, setProject] = useState<Project | null>(null);

  // Spinner
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1400, easing: Easing.linear, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Poll the project until the backend parse finishes.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const p = await Projects.get(projectId);
        if (!alive) return;
        setProject(p);
        if (p.parseStatus === 'ready') {
          navigation.replace('ScriptDetail', { id: p.id });
          return;
        }
        if (p.parseStatus === 'failed') {
          Alert.alert('Parsing failed', p.parseError || 'The script could not be parsed.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
          return;
        }
      } catch {
        // Transient network error: keep polling.
      }
      timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [projectId]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const lineCount = project?.parsedLines?.length || 0;
  const speakerCount = project?.speakers?.length || 0;
  const steps: Array<{ label: string; state: StepState }> = [
    { label: lineCount ? `Extracted text · ${lineCount} lines` : 'Extracting text…', state: lineCount ? 'done' : 'active' },
    { label: speakerCount ? `Found ${speakerCount} characters` : 'Detecting characters…', state: speakerCount ? 'done' : lineCount ? 'active' : 'pending' },
    { label: 'Tagging emotions & beats…', state: speakerCount ? 'active' : 'pending' },
    { label: 'Assigning AI voices', state: 'pending' },
  ];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: S.bg }]}>
      <StatusBar style="light" />
      <View style={styles.center}>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <LinearGradient colors={['#F5A623', '#E0561B', '#C21807', '#9B111E']} style={styles.ring}>
            <View style={styles.ringInner}>
              <View style={styles.dot} />
            </View>
          </LinearGradient>
        </Animated.View>

        <Text style={styles.title}>Reading your script…</Text>
        <Text style={styles.sub}>Detecting characters, splitting lines and tagging emotions.</Text>

        <View style={styles.steps}>
          {steps.map((s) => (
            <View key={s.label} style={[styles.step, s.state === 'pending' && { opacity: 0.4 }]}>
              {s.state === 'done' ? (
                <View style={[styles.stepDot, { backgroundColor: S.success }]}>
                  <Text style={styles.check}>✓</Text>
                </View>
              ) : s.state === 'active' ? (
                <View style={[styles.stepDot, styles.stepSpinner]} />
              ) : (
                <View style={[styles.stepDot, { borderWidth: 2, borderColor: S.border }]} />
              )}
              <Text
                style={{
                  fontFamily: s.state === 'active' ? fonts.bold : fonts.semibold,
                  fontSize: 14,
                  color: s.state === 'active' ? S.accent : s.state === 'done' ? S.text : S.muted,
                }}
              >
                {s.label}
              </Text>
            </View>
          ))}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  ring: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 34 },
  ringInner: { width: 96, height: 96, borderRadius: 48, backgroundColor: S.bg, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 22, height: 22, borderRadius: 11, backgroundColor: RED_DOT },
  title: { fontFamily: fonts.heavy, fontSize: 26, color: S.text, letterSpacing: -0.6, marginBottom: 8 },
  sub: { fontFamily: fonts.regular, fontSize: 14.5, color: S.muted, textAlign: 'center', lineHeight: 21, maxWidth: 280, marginBottom: 40 },
  steps: { width: '100%', maxWidth: 300, gap: 16 },
  step: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stepDot: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  stepSpinner: { borderWidth: 2, borderColor: '#F05A19', borderTopColor: 'transparent' },
  check: { color: '#fff', fontSize: 13, fontFamily: fonts.heavy },
});
