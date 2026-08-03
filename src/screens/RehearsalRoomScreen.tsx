import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Waveform from '../components/Waveform';
import { ProgressBar } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { Projects, Sessions, Speech, Tts, Voices, lineAccuracy, playableLines } from '../api';
import { playBase64, stopPlayback, startRecording, stopRecording } from '../lib/audio';
import { fonts, warmGradient, radii } from '../theme';
import type { LineResult, PlayableLine, Project, RootStackParamList, Session, SessionFeedback } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RehearsalRoom'>;

type Phase = 'loading' | 'ai' | 'user' | 'processing';

// The live rehearsal room. AI lines are spoken via POST /api/tts and
// auto-advance when playback ends; your lines are recorded, sent to
// POST /api/transcribe, and scored. Results land in the session PATCH.
export default function RehearsalRoomScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const projectId = route.params.id;

  const [project, setProject] = useState<Project | null>(null);
  const [lines, setLines] = useState<PlayableLine[]>([]);
  const [voiceMap, setVoiceMap] = useState<Record<string, string>>({});
  const [session, setSession] = useState<Session | null>(null);
  const [idx, setIdx] = useState(0);
  const [phase, setPhase] = useState<Phase>('loading');
  const [recActive, setRecActive] = useState(false);
  const [ttsFailed, setTtsFailed] = useState(false);

  const resultsRef = useRef<LineResult[]>([]);
  const startRef = useRef(Date.now());
  const doneRef = useRef(false);
  const aliveRef = useRef(true);

  // ── Setup: load project, voices, open a session, warm the TTS cache ──
  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      try {
        const p = await Projects.get(projectId);
        if (!aliveRef.current) return;
        const ls = playableLines(p);
        if (!ls.length) {
          Alert.alert('Nothing to rehearse', 'This script has no spoken lines yet.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
          return;
        }
        setProject(p);
        setLines(ls);

        const [assigns, avail] = await Promise.all([
          Voices.forProject(projectId).catch(() => []),
          Voices.available().catch(() => []),
        ]);
        const map: Record<string, string> = {};
        for (const a of assigns) map[a.speaker] = a.voiceId;
        const fallback = avail[0]?.voiceId;
        for (const s of p.speakers || []) if (!map[s] && fallback) map[s] = fallback;
        if (!aliveRef.current) return;
        setVoiceMap(map);

        Sessions.create(projectId)
          .then((s) => {
            if (aliveRef.current) setSession(s);
          })
          .catch(() => {});

        const aiLines = ls
          .filter((l) => !l.mine && map[l.speaker])
          .map((l) => ({
            text: l.text,
            voiceId: map[l.speaker],
            speaker: l.speaker,
            emotion: l.emotion,
            intensity: l.intensity,
          }));
        if (aiLines.length) {
          Tts.pregenerate('baseline', p.title, aiLines).catch(() => {});
        }

        startRef.current = Date.now();
        setPhase(ls[0].mine ? 'user' : 'ai');
      } catch (e) {
        Alert.alert('Could not start rehearsal', e instanceof Error ? e.message : 'Unknown error', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    })();
    return () => {
      aliveRef.current = false;
      void stopPlayback();
      stopRecording().catch(() => null);
    };
  }, [projectId]);

  const line = lines[idx];
  const next = lines[idx + 1];

  // ── Drive each line ──────────────────────────────────────────────────
  useEffect(() => {
    if (!line || phase === 'loading' || phase === 'processing') return;

    if (phase === 'ai') {
      setTtsFailed(false);
      let cancelled = false;
      void (async () => {
        try {
          const res = await Tts.speak({
            text: line.text,
            voiceId: voiceMap[line.speaker],
            profile: 'baseline',
            speaker: line.speaker,
            sceneTitle: project?.title,
            emotion: line.emotion,
            intensity: line.intensity,
          });
          if (cancelled || !aliveRef.current) return;
          await playBase64(res.audioBase64, res.mimeType, () => {
            if (!cancelled && aliveRef.current) advance();
          });
        } catch {
          if (!cancelled && aliveRef.current) setTtsFailed(true); // tap to continue
        }
      })();
      return () => {
        cancelled = true;
        void stopPlayback();
      };
    }

    if (phase === 'user') {
      let cancelled = false;
      void (async () => {
        const ok = await startRecording().catch(() => false);
        if (!cancelled && aliveRef.current) setRecActive(ok);
      })();
      return () => {
        cancelled = true;
      };
    }
  }, [idx, phase, line]);

  const advance = () => {
    if (idx < lines.length - 1) {
      const n = lines[idx + 1];
      setIdx(idx + 1);
      setPhase(n.mine ? 'user' : 'ai');
    } else {
      void finish(true);
    }
  };

  // User taps the mic: stop recording, transcribe, score, advance.
  const captureUserLine = async () => {
    if (phase !== 'user' || !line) return;
    setPhase('processing');
    let spoken: string | null = null;
    try {
      const rec = recActive ? await stopRecording() : null;
      setRecActive(false);
      if (rec?.base64) {
        const t = await Speech.transcribe(rec.base64, rec.mimeType);
        spoken = t?.transcript ?? null;
      }
    } catch {
      // Transcription is best-effort — never block the run on it.
    }
    resultsRef.current.push({
      lineIndex: line.lineIndex ?? idx,
      speaker: line.speaker,
      expected: line.text,
      spoken,
      analyzed: Boolean(spoken),
      accuracy: spoken ? lineAccuracy(line.text, spoken) : null,
    });
    if (idx < lines.length - 1) {
      const n = lines[idx + 1];
      setIdx(idx + 1);
      setPhase(n.mine ? 'user' : 'ai');
    } else {
      void finish(true);
    }
  };

  // ── Wrap up: save the session, then show results ─────────────────────
  const finish = async (completedAll: boolean) => {
    if (doneRef.current) return;
    doneRef.current = true;
    await stopPlayback();
    await stopRecording().catch(() => null);

    const duration = Math.round((Date.now() - startRef.current) / 1000);
    const perLine = resultsRef.current;
    const analyzed = perLine.filter((r) => r.accuracy != null);
    const avgAccuracy = analyzed.length
      ? analyzed.reduce((n, r) => n + (r.accuracy ?? 0), 0) / analyzed.length
      : null;
    const completedLines = completedAll ? lines.length : idx;

    const feedback: SessionFeedback = {
      linesCompleted: completedLines,
      totalLines: lines.length,
      redoCount: 0,
      durationSeconds: duration,
      confidenceScore: avgAccuracy != null ? Math.round(avgAccuracy * 100) : 0,
      notes: '',
      lines: perLine,
      ...(avgAccuracy != null
        ? {
            metrics: { accuracy: Math.round(avgAccuracy * 100) / 100 },
            scores: {
              accuracy: Math.round(avgAccuracy * 100),
              completion: Math.round((completedLines / lines.length) * 100),
            },
          }
        : { analysisSkipped: true, analysisSkippedReason: 'declined' }),
    };

    let saved: Session | null = null;
    if (session) {
      saved = await Sessions.update(projectId, session.id, {
        completedLines,
        duration,
        feedback,
      }).catch(() => null);
    }

    navigation.replace('SessionResults', {
      projectId,
      title: project?.title,
      feedback: saved?.feedback || feedback,
    });
  };

  // ── Render ────────────────────────────────────────────────────────────
  if (phase === 'loading' || !line) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 }}>
          <ActivityIndicator color={theme.accent} size="large" />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: theme.muted }}>
            Setting the stage…
          </Text>
        </View>
      </Screen>
    );
  }

  const aiTurn = !line.mine;
  const processing = phase === 'processing';

  return (
    <Screen>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: theme.muted }}>← Exit</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: theme.text }} numberOfLines={1}>
          {project?.title}
        </Text>
        <TouchableOpacity onPress={() => void finish(false)}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: theme.accent }}>End</Text>
        </TouchableOpacity>
      </View>

      <View style={{ marginTop: 14, marginBottom: 6 }}>
        <ProgressBar progress={(idx + 1) / lines.length} height={4} track={theme.divider} />
      </View>
      <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: theme.muted, textAlign: 'center' }}>
        Line {idx + 1} of {lines.length}
      </Text>

      {aiTurn ? (
        <View style={[styles.focusBanner, { backgroundColor: theme.accentBg, borderColor: theme.accentRing }]}>
          <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: theme.accent }} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.accent }}>
            {ttsFailed ? 'Voice unavailable · tap below to continue' : 'AI scene partner speaking'}
          </Text>
        </View>
      ) : null}

      <View style={styles.stage}>
        {aiTurn ? (
          <>
            <View style={[styles.aiAvatar, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Feather name="volume-2" size={26} color="#F5A623" />
            </View>
            <Text style={[styles.speakerLabel, { color: theme.accent }]}>
              {line.speaker} · SPEAKING
            </Text>
            <View style={{ marginVertical: 20 }}>
              <Waveform variant="ai" />
            </View>
            <Text style={[styles.spokenLine, { color: theme.text }]}>"{line.text}"</Text>
          </>
        ) : (
          <>
            <Text style={[styles.speakerLabel, { color: theme.accent, marginBottom: 18 }]}>
              YOUR LINE · {line.speaker}
            </Text>
            <Text style={[styles.spokenLine, { color: theme.text, marginBottom: 10 }]}>"{line.text}"</Text>
            {line.emotion ? (
              <Text style={{ fontFamily: fonts.regular, fontStyle: 'italic', fontSize: 13, color: theme.muted }}>
                {line.emotion}
              </Text>
            ) : null}
          </>
        )}
      </View>

      {aiTurn ? (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={advance}
          style={[styles.nextCard, { backgroundColor: theme.surface, borderColor: theme.border }]}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.5, color: theme.muted, marginBottom: 5 }}>
            {next ? (next.mine ? `YOUR LINE NEXT · ${next.speaker}` : `NEXT · ${next.speaker}`) : 'LAST LINE'}
          </Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: theme.text, opacity: 0.55, lineHeight: 20 }} numberOfLines={2}>
            {next ? next.text : 'Scene complete — tap to see your results.'}
          </Text>
          <View style={styles.advanceRow}>
            <View style={[styles.checkbox, { backgroundColor: theme.accent }]}>
              <Feather name="check" size={9} color="#fff" />
            </View>
            <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>
              {ttsFailed ? 'Tap to continue' : 'Auto-advances when the line ends · tap to skip'}
            </Text>
          </View>
        </TouchableOpacity>
      ) : (
        <View style={{ alignItems: 'center', gap: 16, paddingBottom: 8 }}>
          <Waveform variant="user" />
          <TouchableOpacity onPress={() => void captureUserLine()} activeOpacity={0.85} disabled={processing}>
            <LinearGradient colors={warmGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.micBtn}>
              {processing ? (
                <ActivityIndicator color="#fff" size="large" />
              ) : (
                <Feather name="mic" size={40} color="#fff" />
              )}
            </LinearGradient>
          </TouchableOpacity>
          <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.text }}>
            {processing
              ? 'Checking your line…'
              : recActive
                ? 'Listening… speak your line'
                : 'Speak your line'}
          </Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted, marginTop: -8 }}>
            {processing ? 'Transcribing with AI' : 'Tap the mic when you finish the line'}
          </Text>
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  focusBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderWidth: 1, borderRadius: radii.pill, paddingVertical: 8, paddingHorizontal: 14, marginTop: 16,
  },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  aiAvatar: { width: 64, height: 64, borderRadius: 32, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  speakerLabel: { fontFamily: fonts.bold, fontSize: 12, letterSpacing: 1 },
  spokenLine: { fontFamily: fonts.serif, fontSize: 25, lineHeight: 35, textAlign: 'center', maxWidth: 310 },
  nextCard: { borderWidth: 1, borderRadius: radii.card, padding: 16 },
  advanceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 11 },
  checkbox: { width: 15, height: 15, borderRadius: 3, alignItems: 'center', justifyContent: 'center' },
  micBtn: {
    width: 104, height: 104, borderRadius: 52, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#C21807', shadowOpacity: 0.5, shadowRadius: 20, shadowOffset: { width: 0, height: 12 }, elevation: 8,
  },
});
