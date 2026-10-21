import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { Feather } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Card from '../components/Card';
import GradientButton from '../components/GradientButton';
import OutlineButton from '../components/OutlineButton';
import { BackButton } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { Sessions, Storage, Usage, getToken } from '../api';
import { scoreFill, scoreLabel, scoreText } from '../lib/scoreColors';
import { DELIVERY_PARAMS, paramLabel, wordDiff } from '../lib/rehearsal';
import { fonts, radii } from '../theme';
import type { LineResult, RecordingClip, RootStackParamList, Session, SessionCoaching, UsageInfo } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'SessionResults'>;
type T = ReturnType<typeof useTheme>['theme'];

// Results are read back from the server: the PATCH in the rehearsal room
// sends placeholders and the API computes every score, so this screen never
// trusts what the client had in memory.
export default function SessionResultsScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { projectId, sessionId } = route.params;
  const [session, setSession] = useState<Session | null>(null);
  const [previous, setPrevious] = useState<Session | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [coaching, setCoaching] = useState<SessionCoaching | null | 'pending'>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [s, list, u] = await Promise.all([
          Sessions.get(projectId, sessionId),
          Sessions.list(projectId).catch(() => [] as Session[]),
          Usage.me().catch(() => null),
        ]);
        setSession(s);
        setUsage(u);
        // Delta is against the last scored, non-skipped session before this one.
        const mine = list.findIndex((x) => x.id === s.id);
        setPrevious(list.slice(mine + 1).find((x) => x.feedback?.confidenceScore != null && !x.feedback.analysisSkipped) ?? null);

        const fb = s.feedback;
        if (fb.sessionCoaching) setCoaching(fb.sessionCoaching);
        else if (!fb.analysisSkipped && fb.lines?.some((l) => l.delivery)) {
          setCoaching('pending');
          Sessions.coachSummary(projectId, sessionId).then(setCoaching).catch(() => setCoaching(null));
        }
      } catch (e) {
        Alert.alert('Session not found', e instanceof Error ? e.message : 'Unknown error', [
          { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }) },
        ]);
      }
    })();
  }, [projectId, sessionId]);

  if (!session) {
    return (
      <Screen>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={theme.accent} size="large" />
        </View>
      </Screen>
    );
  }

  const fb = session.feedback;
  const score = fb.confidenceScore;
  const lines = fb.lines || [];
  const byIndex = new Map(lines.map((l) => [l.lineIndex, l]));
  const weak = (fb.weakLineIndices || []).map((i) => byIndex.get(i)).filter((l): l is LineResult => Boolean(l));

  // Why there is no score, in the web's priority order.
  let noScore: 'declined' | 'budget' | 'limit' | 'noSpeech' | null = null;
  if (score == null) {
    if (fb.analysisSkippedReason === 'declined') noScore = 'declined';
    else if (fb.analysisSkippedReason === 'budget') noScore = 'budget';
    else if (fb.analysisSkipped) noScore = 'limit';
    else if ((fb.version ?? 0) >= 2 && !fb.analyzedLines && usage?.exceeded) noScore = 'budget';
    else noScore = 'noSpeech';
  }
  const delta = score != null && previous?.feedback.confidenceScore != null ? score - previous.feedback.confidenceScore : null;
  const matrix = fb.deliveryMatrix;
  const mins = Math.floor((fb.durationSeconds || 0) / 60);
  const secs = (fb.durationSeconds || 0) % 60;

  const stats = [
    { label: 'Lines done', value: `${fb.linesCompleted}/${fb.totalLines}` },
    { label: 'Completion', value: `${fb.scores?.completion ?? Math.round((fb.linesCompleted / Math.max(1, fb.totalLines)) * 100)}%` },
    { label: 'Redos', value: String(fb.redoCount ?? 0) },
    { label: 'Duration', value: `${mins}:${String(secs).padStart(2, '0')}` },
  ];

  return (
    <Screen padded={false}>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })} />
        <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: theme.text }}>Results</Text>
        <View style={{ width: 38 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24, gap: 16 }}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.accent2 }]}>Session complete</Text>
          <Text style={{ fontFamily: fonts.heavy, fontSize: 32, letterSpacing: -0.8, color: theme.text, marginTop: 4 }}>How'd it go?</Text>
        </View>

        {noScore && noScore !== 'noSpeech' ? (
          <Card>
            <Text style={{ fontSize: 28 }}>{noScore === 'declined' ? '⏭️' : '🔒'}</Text>
            <Text style={[styles.h2, { color: theme.text, marginTop: 8 }]}>
              {noScore === 'declined' ? 'Rehearsal saved — analysis skipped' : noScore === 'limit' ? 'Analysis limit reached' : 'Monthly limit reached'}
            </Text>
            <Text style={[styles.body, { color: theme.muted }]}>
              {noScore === 'declined'
                ? 'You chose not to use an analysis credit for this run. Your lines were saved without scoring.'
                : 'Delivery scoring is paused until your allowance renews. You can still rehearse your scenes.'}
            </Text>
            {noScore !== 'declined' ? (
              <GradientButton small label="View usage" style={{ marginTop: 14 }} onPress={() => navigation.navigate('Billing')} />
            ) : null}
          </Card>
        ) : noScore === 'noSpeech' ? (
          <Card>
            <Text style={{ fontSize: 28 }}>🎙️</Text>
            <Text style={[styles.h2, { color: theme.text, marginTop: 8 }]}>We couldn't score this run</Text>
            <Text style={[styles.body, { color: theme.muted }]}>{fb.notes || 'We didn’t catch any of your lines clearly enough to score. Try again a touch closer to the mic.'}</Text>
          </Card>
        ) : (
          <Card style={{ alignItems: 'center' }}>
            <Text style={[styles.eyebrow, { color: theme.muted }]}>Overall score</Text>
            <ScoreRing theme={theme} score={score!} />
            <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: scoreText(theme, score!), marginTop: 6 }}>{scoreLabel(score!)}</Text>
            {delta != null ? (
              <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, marginTop: 4, color: delta > 0 ? theme.success : delta < 0 ? theme.destructive : theme.muted }}>
                {delta > 0 ? `▲ ${delta} vs last session` : delta < 0 ? `▼ ${Math.abs(delta)} vs last session` : 'Same as last session'}
              </Text>
            ) : null}
            {coaching && coaching !== 'pending' && coaching.sceneScores ? (
              <View style={[styles.twoCol, { marginTop: 18 }]}>
                <SceneScore theme={theme} label="Emotional arc" value={coaching.sceneScores.emotionalArc} note={coaching.sceneScores.arcNote} />
                <SceneScore theme={theme} label="Character voice" value={coaching.sceneScores.characterConsistency} note={coaching.sceneScores.consistencyNote} />
              </View>
            ) : null}
          </Card>
        )}

        {fb.recording?.clips?.length ? (
          <ScenePlayer
            theme={theme}
            clips={fb.recording.clips}
            onDelete={() =>
              Alert.alert('Delete recording?', 'The audio of this run is deleted. Your score and notes stay.', [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Delete',
                  style: 'destructive',
                  onPress: () =>
                    Sessions.deleteRecording(projectId, sessionId)
                      .then(setSession)
                      .catch((e) => Alert.alert('Could not delete recording', e instanceof Error ? e.message : 'Unknown error')),
                },
              ])
            }
          />
        ) : null}

        {matrix && matrix.analyzedCount > 0 ? (
          <Card>
            <Text style={[styles.h2, { color: theme.text }]}>Delivery breakdown</Text>
            {['Vocal', 'Emotional & Interpretive', 'Textual & Character', 'Technical'].map((cat) => {
              const params = DELIVERY_PARAMS.filter((p) => p.category === cat).map((p) => ({ ...p, value: matrix.parameters.find((m) => m.key === p.key)?.value ?? null }));
              return (
                <View key={cat} style={{ marginTop: 14 }}>
                  <Text style={[styles.eyebrow, { color: theme.muted }]}>{cat}</Text>
                  {params.map((p) => (
                    <View key={p.key} style={{ marginTop: 8 }}>
                      <View style={styles.rowBetween}>
                        <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: theme.text }}>{p.label}</Text>
                        <Text style={{ fontFamily: fonts.bold, fontSize: 12.5, color: p.value == null ? theme.muted : scoreText(theme, p.value) }}>{p.value == null ? 'Not assessed' : p.value}</Text>
                      </View>
                      <View style={[styles.bar, { backgroundColor: theme.surfaceAlt }]}>
                        <View style={{ width: `${p.value ?? 0}%`, height: '100%', backgroundColor: p.value == null ? 'transparent' : scoreFill(p.value), borderRadius: 4 }} />
                      </View>
                    </View>
                  ))}
                </View>
              );
            })}
          </Card>
        ) : null}

        {fb.coaching && (fb.analyzedLines ?? 0) > 0 ? (
          <Card>
            <Text style={[styles.h2, { color: theme.text }]}>Coach's notes</Text>
            {fb.coaching.summary ? <Text style={[styles.body, { color: theme.text }]}>{fb.coaching.summary}</Text> : null}
            {fb.coaching.strengths?.length ? (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.eyebrow, { color: theme.muted }]}>What's working</Text>
                {fb.coaching.strengths.map((s, i) => <Bullet key={i} theme={theme} icon="check" color={theme.success} text={s} />)}
              </View>
            ) : null}
            {fb.coaching.improvements?.length ? (
              <View style={{ marginTop: 12 }}>
                <Text style={[styles.eyebrow, { color: theme.muted }]}>Where to focus, and how</Text>
                {fb.coaching.improvements.map((s, i) => <Bullet key={i} theme={theme} icon="arrow-right" color={theme.warning} text={s} />)}
              </View>
            ) : null}
            {fb.coaching.practicePlan ? (
              <View style={[styles.box, { backgroundColor: theme.surfaceAlt }]}>
                <Text style={[styles.eyebrow, { color: theme.muted }]}>Your next practice</Text>
                <Text style={[styles.body, { color: theme.text, marginTop: 4 }]}>{fb.coaching.practicePlan}</Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {coaching === 'pending' ? (
          <Card style={{ alignItems: 'center' }}><ActivityIndicator color={theme.accent} /><Text style={[styles.body, { color: theme.muted, marginTop: 8 }]}>Your coach is reading the session…</Text></Card>
        ) : coaching ? (
          <Card>
            <Text style={[styles.h2, { color: theme.text }]}>Your coach's read on the session</Text>
            <Text style={[styles.body, { color: theme.text }]}>{coaching.summary}</Text>
            {coaching.focusAreas?.map((f, i) => (
              <View key={i} style={[styles.box, { backgroundColor: theme.warningBg }]}>
                <Text style={{ fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, color: theme.warning }}>{paramLabel(f.area).toUpperCase()}</Text>
                <Text style={[styles.body, { color: theme.text, marginTop: 4 }]}>{f.note}</Text>
                <Text style={[styles.body, { color: theme.muted, marginTop: 4 }]}>Drill: {f.drill}</Text>
              </View>
            ))}
            {coaching.encouragement ? <Text style={[styles.body, { color: theme.muted, fontStyle: 'italic', marginTop: 10 }]}>{coaching.encouragement}</Text> : null}
          </Card>
        ) : null}

        <View style={styles.grid}>
          {stats.map((m) => (
            <Card key={m.label} style={{ width: '48%' }} padding={13}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: theme.muted, marginBottom: 4 }}>{m.label}</Text>
              <Text style={{ fontFamily: fonts.heavy, fontSize: 24, letterSpacing: -0.5, color: theme.accent }}>{m.value}</Text>
            </Card>
          ))}
        </View>

        {weak.length ? (
          <View style={{ gap: 10 }}>
            <Text style={[styles.h2, { color: theme.text }]}>Lines to revisit</Text>
            {weak.map((l) => <LineCard key={l.lineIndex} theme={theme} line={l} />)}
            <OutlineButton secondary icon="rotate-ccw" label="Redo weak lines" onPress={() => navigation.replace('RehearsalRoom', { id: projectId, focus: fb.weakLineIndices })} />
          </View>
        ) : null}

        {lines.length ? (
          <View style={{ gap: 10 }}>
            <TouchableOpacity onPress={() => setShowAll((v) => !v)} style={styles.rowBetween}>
              <Text style={[styles.h2, { color: theme.text }]}>All lines ({lines.length})</Text>
              <Feather name={showAll ? 'chevron-up' : 'chevron-down'} size={18} color={theme.muted} />
            </TouchableOpacity>
            {showAll ? lines.map((l) => <LineCard key={l.lineIndex} theme={theme} line={l} />) : null}
          </View>
        ) : null}

        <View style={{ gap: 10, marginTop: 6 }}>
          <GradientButton label="Rehearse again" onPress={() => navigation.replace('RehearsalRoom', { id: projectId })} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <OutlineButton flex icon="file-text" label="View script" onPress={() => navigation.replace('ScriptDetail', { id: projectId })} />
            <OutlineButton flex icon="home" label="Dashboard" onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })} />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────

function ScoreRing({ theme, score }: { theme: T; score: number }) {
  const r = 50, c = 2 * Math.PI * r;
  return (
    <View style={{ width: 120, height: 120, alignItems: 'center', justifyContent: 'center', marginTop: 10 }}>
      <Svg width={120} height={120} style={StyleSheet.absoluteFill}>
        <Circle cx={60} cy={60} r={r} stroke={theme.surfaceAlt} strokeWidth={8} fill="none" />
        <Circle
          cx={60} cy={60} r={r} stroke={scoreFill(score)} strokeWidth={8} fill="none" strokeLinecap="round"
          strokeDasharray={`${c} ${c}`} strokeDashoffset={c * (1 - Math.min(100, Math.max(0, score)) / 100)}
          transform="rotate(-90 60 60)"
        />
      </Svg>
      <Text style={{ fontFamily: fonts.heavy, fontSize: 34, letterSpacing: -1, color: scoreText(theme, score) }}>{score}</Text>
    </View>
  );
}

function SceneScore({ theme, label, value, note }: { theme: T; label: string; value: number | null; note: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={[styles.eyebrow, { color: theme.muted }]}>{label}</Text>
      <Text style={{ fontFamily: fonts.heavy, fontSize: 22, color: value == null ? theme.muted : scoreText(theme, value), marginTop: 2 }}>{value ?? '—'}</Text>
      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted, lineHeight: 17 }}>{value == null ? 'Not assessed' : note}</Text>
    </View>
  );
}

function Bullet({ theme, icon, color, text }: { theme: T; icon: keyof typeof Feather.glyphMap; color: string; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
      <Feather name={icon} size={14} color={color} style={{ marginTop: 3 }} />
      <Text style={[styles.body, { color: theme.text, flex: 1, marginTop: 0 }]}>{text}</Text>
    </View>
  );
}

function LineCard({ theme, line }: { theme: T; line: LineResult }) {
  const d = line.delivery;
  const headline = d?.overall ?? (d?.emotionMatch != null ? Math.round(d.emotionMatch * 100) : null);
  const diff = line.analyzed ? wordDiff(line.expected, line.spoken) : null;
  const clean = diff && diff.words.every((w) => w.status === 'matched') && !diff.extras.length;
  const scores = d?.scores ? DELIVERY_PARAMS.map((p) => ({ ...p, value: d.scores![p.key] })).filter((p) => p.value != null) : [];
  return (
    <Card padding={14}>
      <View style={[styles.rowBetween, { alignItems: 'flex-start', gap: 10 }]}>
        <Text style={{ fontFamily: fonts.medium, fontSize: 14.5, color: theme.text, lineHeight: 21, flex: 1 }}>“{line.expected}”</Text>
        <Text style={{ fontFamily: fonts.heavy, fontSize: 18, color: headline == null ? theme.muted : scoreText(theme, headline) }}>
          {headline == null ? (line.analyzed ? '' : 'no audio') : headline}
        </Text>
      </View>
      {diff ? (
        <View style={{ marginTop: 10 }}>
          <Text style={[styles.eyebrow, { color: theme.muted }]}>Word match</Text>
          {clean ? (
            <Text style={[styles.body, { color: theme.success }]}>Clean delivery, nailed it.</Text>
          ) : (
            <Text style={[styles.body, { color: theme.text }]}>
              {diff.words.map((w, i) => (
                <Text key={i}>
                  {w.status === 'matched' ? <Text style={{ color: theme.success }}>{w.text}</Text>
                    : w.status === 'changed' ? <><Text style={{ color: theme.warning, textDecorationLine: 'line-through' }}>{w.text}</Text><Text style={{ color: theme.warning }}> {w.spoken}</Text></>
                    : <Text style={{ color: theme.destructive, textDecorationLine: 'line-through' }}>{w.text}</Text>}
                  {' '}
                </Text>
              ))}
              {diff.extras.map((x, i) => <Text key={`x${i}`} style={{ color: theme.destructive, fontStyle: 'italic' }}>+{x} </Text>)}
            </Text>
          )}
        </View>
      ) : null}
      {d ? (
        <View style={{ marginTop: 10, gap: 6 }}>
          {d.strengths?.map((s, i) => <Bullet key={`s${i}`} theme={theme} icon="check" color={theme.success} text={s} />)}
          {d.improvements?.map((imp, i) => (
            <View key={`i${i}`} style={{ marginTop: 4 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.6, color: theme.warning }}>{paramLabel(imp.area).toUpperCase()}</Text>
              <Text style={[styles.body, { color: theme.text, marginTop: 2 }]}>{imp.note}</Text>
              <Text style={[styles.body, { color: theme.muted, marginTop: 2 }]}>Try: {imp.tryThis}</Text>
            </View>
          ))}
          {d.retakeFocus ? (
            <View style={[styles.box, { backgroundColor: theme.accentBg }]}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: theme.accent }}>Next take: <Text style={{ fontFamily: fonts.regular, color: theme.text }}>{d.retakeFocus}</Text></Text>
            </View>
          ) : null}
          {d.coachNote ? <Text style={[styles.body, { color: theme.muted, fontStyle: 'italic' }]}>{d.coachNote}</Text> : null}
          {d.deliveredEmotion ? <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.muted }}>Emotion: {d.deliveredEmotion} vs {d.intendedEmotion}</Text> : null}
          {scores.length ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
              {scores.map((p) => (
                <View key={p.key} style={[styles.chip, { backgroundColor: theme.surfaceAlt }]}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: theme.muted }}>{p.short} </Text>
                  <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: scoreText(theme, p.value!) }}>{p.value}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

// Plays the saved clips in performance order, straight from private storage.
function ScenePlayer({ theme, clips, onDelete }: { theme: T; clips: RecordingClip[]; onDelete: () => void }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const player = useRef<AudioPlayer | null>(null);
  const iRef = useRef(0);

  const unload = () => {
    const p = player.current;
    player.current = null;
    if (p) { try { p.pause(); } catch {} try { p.remove(); } catch {} }
  };
  useEffect(() => unload, []);

  const playAt = async (n: number) => {
    unload();
    if (n >= clips.length) { setPlaying(false); setI(0); iRef.current = 0; return; }
    iRef.current = n;
    setI(n);
    setPlaying(true);
    try {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      const token = getToken();
      const p = createAudioPlayer(
        { uri: Storage.objectUrl(clips[n].objectPath), headers: token ? { Authorization: `Bearer ${token}` } : undefined },
        { updateInterval: 250 }
      );
      player.current = p;
      p.addListener('playbackStatusUpdate', (st) => {
        if (player.current !== p) return;
        if (st.didJustFinish || st.error) void playAt(iRef.current + 1);
      });
      p.play();
    } catch {
      void playAt(n + 1);
    }
  };

  const toggle = async () => {
    const p = player.current;
    if (!p) return playAt(i);
    if (p.playing) { p.pause(); setPlaying(false); }
    else { p.play(); setPlaying(true); }
  };

  const clipTag = (c: RecordingClip) => (c.role === 'user' ? 'You' : `${c.speaker} · AI`);

  return (
    <Card>
      <View style={styles.rowBetween}>
        <Text style={[styles.eyebrow, { color: theme.muted }]}>Replay the scene</Text>
        <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.muted }}>{i + 1} / {clips.length}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 }}>
        <TouchableOpacity onPress={() => void toggle()} style={[styles.playBtn, { backgroundColor: theme.accent }]} accessibilityLabel={playing ? 'Pause' : 'Play'}>
          <Feather name={playing ? 'pause' : 'play'} size={20} color="#fff" style={playing ? undefined : { marginLeft: 3 }} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: clips[i].role === 'user' ? theme.tpYou : theme.tpPartner }}>{clipTag(clips[i])}</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted }} numberOfLines={2}>“{clips[i].text}”</Text>
        </View>
      </View>
      <View style={{ marginTop: 12, maxHeight: 200 }}>
        <ScrollView nestedScrollEnabled>
          {clips.map((c, n) => (
            <TouchableOpacity key={`${c.lineIndex}-${n}`} onPress={() => void playAt(n)} style={[styles.clipRow, n === i && { backgroundColor: theme.accentBg }]}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 11, color: c.role === 'user' ? theme.tpYou : theme.tpPartner, width: 78 }} numberOfLines={1}>{clipTag(c)}</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.text, flex: 1 }} numberOfLines={1}>{c.text}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={{ fontFamily: fonts.regular, fontSize: 11, color: theme.muted }}>Cloud recordings are kept for 7 days.</Text>
        <TouchableOpacity onPress={onDelete} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.destructive }}>Delete recording</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 8 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase' },
  h2: { fontFamily: fonts.bold, fontSize: 16, letterSpacing: -0.2 },
  body: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20, marginTop: 6 },
  twoCol: { flexDirection: 'row', gap: 14, alignSelf: 'stretch' },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden', marginTop: 5 },
  box: { borderRadius: radii.tile, padding: 12, marginTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 10 },
  chip: { flexDirection: 'row', borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 4 },
  playBtn: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  clipRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 8, borderRadius: radii.control },
});
