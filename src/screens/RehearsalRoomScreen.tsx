import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Animated, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Waveform from '../components/Waveform';
import GradientButton from '../components/GradientButton';
import { BackButton, ProgressBar } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import {
  ApiError, Projects, Sessions, Speech, Storage, Tts, Usage, Voices, myCharacters, playableLines,
  type AnalyzeDeliveryBody, type PrepBatch,
} from '../api';
import {
  cacheClip, leaveRehearsalAudioMode, micPermission,
  playClip, putFile, startRecording, stopPlayback, stopRecording, type MicPermission, type RecordedAudio,
} from '../lib/audio';
import { askMicrophone, openSettingsForPermission } from '../lib/permissions';
import {
  buildSequence, clip, estimateDuration, expectedMs, feedEndpointer, findRedoStep, newEndpointer,
  sceneWindow, ttsContext, type Endpointer,
} from '../lib/rehearsal';
import { fonts, radii, palette, brandGradient, brandGradientLocations, gradientStart, gradientEnd } from '../theme';
import type { LineResult, PlayableLine, Project, RecordingClip, RootStackParamList, SessionFeedback, TranscriptResult, UsageInfo } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'RehearsalRoom'>;

type Phase = 'idle' | 'loading' | 'speaking' | 'my-turn' | 'paused' | 'error' | 'saving';

const FALLBACK_VOICE = 'EXAVITQu4vr4xnSDxMaL';
const DEMO_EMAIL = 'demo@reherza.com';

interface AiClip { uri: string | null; mimeType: string; mock: boolean; base64: string }
interface Capture {
  durationMs: number;
  longPauses: number;
  timeToFirstSpeechMs: number;
  audio: RecordedAudio | null;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function pool<T>(items: T[], size: number, fn: (item: T, i: number) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    })
  );
}

// The live rehearsal room — a native port of the web's RehearsalRoom turn
// engine. The partner's lines are voiced from a warmed TTS cache; your lines
// are recorded with live metering and end on their own when you fall silent;
// transcription runs behind the next line; the pass is scored server-side
// after an analysis-credit check, then the session is saved and opened.
export default function RehearsalRoomScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const projectId = route.params.id;
  const focus = route.params.focus;

  // ── Scene data ──
  const [project, setProject] = useState<Project | null>(null);
  const [lines, setLines] = useState<PlayableLine[]>([]);
  const [seq, setSeq] = useState<number[]>([]);
  const voiceMap = useRef<Record<string, string>>({});
  const usageRef = useRef<UsageInfo | null>(null);

  // ── Machine ──
  const [phase, setPhase] = useState<Phase>('idle');
  const phaseRef = useRef<Phase>('idle');
  const [step, setStep] = useState(0);
  const stepRef = useRef(0);
  const [redoCount, setRedoCount] = useState(0);
  const redoRef = useRef(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // ── Start gate ──
  const [creditsChecked, setCreditsChecked] = useState(false);
  const [blocked, setBlocked] = useState<{ message: string; billingLocked?: boolean } | null>(null);
  const [micState, setMicState] = useState<MicPermission>('undetermined');
  const micRef = useRef<MicPermission>('undetermined');
  const [prep, setPrep] = useState<{ done: number; total: number } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);

  // ── Your turn ──
  const [listening, setListening] = useState(false);
  const [level, setLevel] = useState(0);
  const [deviceLoss, setDeviceLoss] = useState<string | null>(null);

  // ── Saving ──
  const [saveStatus, setSaveStatus] = useState<{ text: string; done?: number; total?: number }>({ text: '' });

  // ── Refs the async engine reads ──
  const epochRef = useRef(0);
  const aliveRef = useRef(true);
  const advancingRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const startTimeRef = useRef(0);
  const prefetched = useRef(new Map<number, Promise<AiClip>>());
  const played = useRef(new Set<number>());
  const captures = useRef(new Map<number, Capture>());
  const pendingTranscripts = useRef(new Map<number, Promise<TranscriptResult | null>>());
  const pendingCapture = useRef<Promise<void> | null>(null);
  const endpointer = useRef<Endpointer>(newEndpointer());
  const lastSampleAt = useRef(0);
  const recordStartAt = useRef(0);
  const linesRef = useRef<PlayableLine[]>([]);
  const seqRef = useRef<number[]>([]);

  const setPhaseBoth = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const setStepBoth = (s: number) => { stepRef.current = s; setStep(s); };
  const setMic = (p: MicPermission) => { micRef.current = p; setMicState(p); };
  const setRedo = (n: number) => { redoRef.current = n; setRedoCount(n); };
  const toast = (text: string) => { setNotice(text); setTimeout(() => setNotice((n) => (n === text ? null : n)), 4500); };

  // Line-card entry animation (the web's fadeSlideUp, 0.3 s).
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    enter.setValue(0);
    Animated.timing(enter, { toValue: 1, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [step, phase === 'idle', enter]);

  // Keep the screen on from Start through the save.
  const awake = phase !== 'idle' || prep != null || countdown != null;
  useEffect(() => {
    if (!awake) return;
    void activateKeepAwakeAsync();
    return () => { deactivateKeepAwake(); };
  }, [awake]);

  // ── Load the scene, then run the credit preflight ──
  useEffect(() => {
    aliveRef.current = true;
    void (async () => {
      try {
        const p = await Projects.get(projectId);
        if (!aliveRef.current) return;
        const ls = playableLines(p);
        if (!ls.length || !myCharacters(p).length) {
          Alert.alert('Set up this script first', 'Pick the character you are playing before rehearsing.', [
            { text: 'OK', onPress: () => navigation.replace('ScriptDetail', { id: projectId }) },
          ]);
          return;
        }
        const [assigns, usage, perm] = await Promise.all([
          Voices.forProject(projectId).catch(() => []),
          Usage.me().catch(() => null),
          micPermission(),
        ]);
        for (const a of assigns) voiceMap.current[a.speaker] = a.voiceId;
        usageRef.current = usage;
        const sq = buildSequence(ls, focus);
        linesRef.current = ls;
        seqRef.current = sq;
        if (!aliveRef.current) return;
        setProject(p);
        setLines(ls);
        setSeq(sq);
        setMic(perm);

        const batch = prepBatch(p, ls, sq);
        if (batch.lines.length) {
          const pre = await Tts.preflight(batch);
          if (!aliveRef.current) return;
          if (!pre.allowed) {
            setBlocked({ message: pre.error || "You're out of voice credits for this scene.", billingLocked: pre.billingLocked });
          }
        }
        setCreditsChecked(true);
      } catch (e) {
        Alert.alert('Could not open the room', e instanceof Error ? e.message : 'Unknown error', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    })();
    return () => {
      aliveRef.current = false;
      epochRef.current += 1;
      void stopPlayback();
      stopRecording().catch(() => null);
      void leaveRehearsalAudioMode();
    };
  }, [projectId]);

  const prepBatch = (p: Project, ls: PlayableLine[], sq: number[]): PrepBatch => ({
    profile: 'enhanced',
    sceneTitle: p.title,
    projectId: p.id,
    lines: sq
      .map((_, s) => s)
      .filter((s) => !ls[sq[s]].mine)
      .map((s) => ({ ...ttsContext(ls, sq, s), voiceId: voiceMap.current[ls[sq[s]].speaker] || FALLBACK_VOICE })),
  });

  // ── TTS cache: one promise per line index, evicted on failure ──
  const getAi = (s: number): Promise<AiClip> => {
    const ls = linesRef.current, sq = seqRef.current;
    const idx = sq[s];
    const hit = prefetched.current.get(idx);
    if (hit) return hit;
    const p = (async (): Promise<AiClip> => {
      const line = ls[idx];
      const res = await Tts.speak({
        ...ttsContext(ls, sq, s),
        voiceId: voiceMap.current[line.speaker] || FALLBACK_VOICE,
        profile: 'enhanced',
        sceneTitle: project?.title,
        projectId,
      });
      const uri = res.mock ? null : await cacheClip(`${projectId}-${idx}`, res.audioBase64, res.mimeType);
      return { uri, mimeType: res.mimeType, mock: Boolean(res.mock), base64: res.audioBase64 };
    })();
    prefetched.current.set(idx, p);
    p.catch(() => prefetched.current.delete(idx));
    return p;
  };

  // ── Start ──
  const handleStart = async () => {
    if (!project || !creditsChecked || blocked || phaseRef.current !== 'idle') return;
    // A refused mic doesn't block the scene: the run continues in manual mode
    // (Done Speaking only), exactly as the start card's notice promises.
    setMic(await askMicrophone());

    played.current.clear();
    captures.current.clear();
    pendingTranscripts.current.clear();
    setRedo(0);

    const ls = linesRef.current, sq = seqRef.current;
    const aiSteps = sq.map((_, s) => s).filter((s) => !ls[sq[s]].mine);
    if (aiSteps.length) {
      setPrep({ done: 0, total: aiSteps.length });
      const batch = prepBatch(project, ls, sq);
      try {
        // Pregenerate loops until the server says ready (~22 s per answer).
        let busyRetries = 0;
        for (let round = 0; round < 60; round++) {
          let r;
          try {
            r = await Tts.pregenerate(batch);
          } catch (e) {
            if (e instanceof ApiError && e.status === 503 && busyRetries++ < 3) { await sleep(4000); continue; }
            throw e;
          }
          if (!aliveRef.current) return;
          setPrep({ done: Math.round(((r.generated + r.cached) / Math.max(1, r.total)) * aiSteps.length), total: aiSteps.length });
          if (r.withheld) toast(`${r.withheld} edited line${r.withheld === 1 ? '' : 's'} can't get a new voice while you're out of credits — it'll play as a silent read.`);
          if (r.ready) break;
          if (r.code !== 'preparation_in_progress') throw new ApiError(502, 'AI voices could not be prepared. Please try again.', r);
          if (r.generated + r.cached === 0) await sleep(750);
        }
        // Hydrate the local cache — all server-side hits now, 3 at a time.
        let done = 0;
        await pool(aiSteps, 3, async (s) => {
          try {
            await getAi(s);
          } catch (e) {
            if (!(e instanceof ApiError && e.status === 402)) throw e;
            prefetched.current.set(sq[s], Promise.resolve({ uri: null, mimeType: '', mock: true, base64: '' }));
          }
          done += 1;
          if (aliveRef.current) setPrep({ done, total: aiSteps.length });
        });
      } catch (e) {
        if (!aliveRef.current) return;
        setPrep(null);
        const limit = e instanceof ApiError && e.status === 402;
        setBlocked({
          message: limit
            ? (e instanceof Error && e.message) || "You're out of voice credits for this scene."
            : 'AI voices could not be prepared. Please try again.',
          billingLocked: !limit,
        });
        return;
      }
      setPrep(null);
    }

    try {
      const s = await Sessions.create(projectId);
      sessionIdRef.current = s.id;
    } catch (e) {
      Alert.alert('Could not start a session', e instanceof Error ? e.message : 'Unknown error');
      return;
    }

    for (const n of [3, 2, 1]) {
      if (!aliveRef.current) return;
      setCountdown(n);
      await sleep(1000);
    }
    setCountdown(null);
    startTimeRef.current = Date.now();
    void processStep(0);
  };

  // ── The turn engine ──
  const processStep = async (s: number) => {
    const epoch = ++epochRef.current;
    const ls = linesRef.current, sq = seqRef.current;
    if (s >= sq.length) { void saveAndNavigate(); return; }
    setStepBoth(s);
    setErrorMsg(null);
    const line = ls[sq[s]];
    if (line.mine) return runUserTurn(s, epoch);

    setPhaseBoth('loading');
    let ai: AiClip;
    try {
      ai = await getAi(s);
    } catch (e) {
      if (epoch !== epochRef.current) return;
      if (e instanceof ApiError && e.status === 402) {
        toast(e.message || 'Monthly usage limit reached — this line plays as a silent read.');
        ai = { uri: null, mimeType: '', mock: true, base64: '' };
      } else {
        setErrorMsg(e instanceof Error ? e.message : 'Voice generation failed. Please try again shortly.');
        setPhaseBoth('error');
        return;
      }
    }
    if (epoch !== epochRef.current) return;
    setPhaseBoth('speaking');
    if (ai.uri) await playClip(ai.uri);
    else await sleep(estimateDuration(line.text));
    if (epoch !== epochRef.current) return;
    played.current.add(sq[s]);
    void processStep(s + 1);
  };

  const runUserTurn = async (s: number, epoch: number) => {
    const ls = linesRef.current, sq = seqRef.current;
    setPhaseBoth('my-turn');
    if (s + 1 < sq.length && !ls[sq[s + 1]].mine) getAi(s + 1).catch(() => {});
    endpointer.current = newEndpointer();
    lastSampleAt.current = 0;
    setLevel(0);
    if (micRef.current !== 'granted') return; // manual mode: Done only
    const expected = expectedMs(ls[sq[s]].text);
    try {
      await startRecording((sample) => {
        if (epoch !== epochRef.current || phaseRef.current !== 'my-turn') return;
        const now = Date.now();
        const dt = lastSampleAt.current ? Math.min(now - lastSampleAt.current, 400) : 100;
        lastSampleAt.current = now;
        endpointer.current = feedEndpointer(endpointer.current, sample.db, dt, now, expected);
        setLevel(Math.min(1, Math.max(0, (sample.db + 60) / 60)));
        if (endpointer.current.done) void handleDone();
      });
      recordStartAt.current = Date.now();
      if (epoch === epochRef.current) setListening(true);
    } catch {
      if (epoch === epochRef.current) onDeviceLoss('in-use');
    }
  };

  // Stop the mic and hand the clip to transcription without blocking the reply.
  const captureUserLine = async (idx: number) => {
    const e = endpointer.current;
    const rec = await stopRecording().catch(() => null);
    setListening(false);
    setLevel(0);
    const audio = rec && rec.bytes >= 3000 ? rec : null;
    captures.current.set(idx, {
      durationMs: e.firstSpeechAt != null && e.lastSpeechAt != null ? e.lastSpeechAt - e.firstSpeechAt : 0,
      longPauses: e.longPauses,
      timeToFirstSpeechMs: e.firstSpeechAt != null ? Math.max(0, e.firstSpeechAt - recordStartAt.current) : 0,
      audio,
    });
    if (audio) {
      pendingTranscripts.current.set(
        idx,
        Speech.transcribe({
          audioBase64: audio.base64,
          mimeType: audio.mimeType,
          sessionId: sessionIdRef.current ?? undefined,
          lineIndex: idx,
          expected: linesRef.current[idx].text,
        }).catch(() => null)
      );
    }
  };

  const handleDone = async () => {
    if (phaseRef.current !== 'my-turn' || advancingRef.current) return;
    advancingRef.current = true;
    const idx = seqRef.current[stepRef.current];
    pendingCapture.current = captureUserLine(idx);
    played.current.add(idx);
    void processStep(stepRef.current + 1);
    advancingRef.current = false;
  };

  // ── Controls ──
  const halt = async () => {
    epochRef.current += 1;
    await stopPlayback();
    await pendingCapture.current;
    await stopRecording().catch(() => null);
    setListening(false);
    setLevel(0);
  };

  const handlePause = async () => {
    if (!['speaking', 'loading', 'my-turn'].includes(phaseRef.current)) return;
    await halt();
    setPhaseBoth('paused');
  };

  const handleResume = () => {
    if (phaseRef.current !== 'paused') return;
    void processStep(stepRef.current);
  };

  const discard = (from: number, to: number) => {
    for (let s = from; s <= to; s++) {
      const idx = seqRef.current[s];
      captures.current.delete(idx);
      pendingTranscripts.current.delete(idx);
      played.current.delete(idx);
    }
  };

  const handleRedo = async () => {
    if (!['speaking', 'loading', 'my-turn', 'paused'].includes(phaseRef.current)) return;
    await halt();
    const target = findRedoStep(seqRef.current, linesRef.current, stepRef.current);
    discard(target, stepRef.current);
    setRedo(redoRef.current + 1);
    void processStep(target);
  };

  const handleBack = async () => {
    if (phaseRef.current === 'idle' || stepRef.current === 0) return;
    await halt();
    const target = stepRef.current - 1;
    discard(target, stepRef.current);
    void processStep(target);
  };

  const handleRestart = async () => {
    if (phaseRef.current === 'idle') return;
    await halt();
    played.current.clear();
    captures.current.clear();
    pendingTranscripts.current.clear();
    setRedo(0);
    setStepBoth(0);
    setPhaseBoth('idle');
  };

  const handleEnd = async () => {
    if (phaseRef.current === 'my-turn') {
      pendingCapture.current = captureUserLine(seqRef.current[stepRef.current]);
    }
    void saveAndNavigate();
  };

  const handleExit = () => {
    if (phaseRef.current === 'idle') { navigation.goBack(); return; }
    Alert.alert('Leave the rehearsal?', 'This run will not be saved.', [
      { text: 'Stay', style: 'cancel' },
      { text: 'Leave', style: 'destructive', onPress: () => navigation.goBack() },
    ]);
  };

  const onDeviceLoss = (why: 'in-use' | 'denied') => {
    void handlePause();
    setDeviceLoss(why === 'denied' ? 'Your mic is switched off for Reherza' : 'Something else is using your mic');
  };

  const retryMic = async () => {
    const perm = await askMicrophone();
    setMic(perm);
    if (perm === 'granted') { setDeviceLoss(null); handleResume(); }
    else setDeviceLoss('Your mic is switched off for Reherza');
  };

  // ── Finish: transcripts → analysis gate → clips → PATCH → results ──
  const saveAndNavigate = async () => {
    if (phaseRef.current === 'saving') return;
    setPhaseBoth('saving');
    setSaveStatus({ text: 'Wrapping up your session…' });
    await halt();
    const ls = linesRef.current;

    const transcripts = new Map<number, TranscriptResult | null>();
    await Promise.all([...pendingTranscripts.current].map(async ([idx, p]) => transcripts.set(idx, await p)));

    const analyses: LineResult[] = [...played.current]
      .filter((idx) => ls[idx].mine)
      .sort((a, b) => a - b)
      .map((idx) => {
        const c = captures.current.get(idx);
        const t = transcripts.get(idx);
        return {
          lineIndex: idx, speaker: ls[idx].speaker, expected: ls[idx].text,
          spoken: t?.transcript ?? '', confidence: t?.confidence ?? 0, transcriptAttestation: t?.attestation,
          durationMs: c?.durationMs ?? 0, longPauses: c?.longPauses ?? 0, timeToFirstSpeechMs: c?.timeToFirstSpeechMs ?? 0,
          analyzed: Boolean(t?.transcript),
          accuracy: 0, missingWords: [], extraWords: [], repeatedWords: [], changedWords: [], fillerWords: [], fillerCount: 0, wpm: 0, lowConfidenceWords: [], issues: [],
        };
      });

    // Analysis-credit gate.
    const candidates = analyses.filter((a) => a.analyzed && captures.current.get(a.lineIndex)?.audio);
    let skipped: SessionFeedback['analysisSkippedReason'] | undefined;
    const usage = await Usage.me().catch(() => usageRef.current);
    const costExhausted = Boolean(usage?.exceeded || usage?.charsExceeded);
    if (usage?.analysesExceeded) skipped = 'limit';
    else if (costExhausted && !candidates.length) skipped = 'budget';
    else if (candidates.length && usage && usage.analysisLimit !== null) {
      setSaveStatus({ text: 'One moment…' });
      if (!(await confirmAnalysis(usage))) skipped = 'declined';
    }

    if (!skipped && candidates.length) {
      const analysisId = Crypto.randomUUID();
      let done = 0;
      setSaveStatus({ text: 'Your coach is reviewing your delivery…', done, total: candidates.length });
      let limitHit = false;
      await pool(candidates, 3, async (a) => {
        if (limitHit) return;
        const line = ls[a.lineIndex];
        const audio = captures.current.get(a.lineIndex)!.audio!;
        const body: AnalyzeDeliveryBody = {
          audioBase64: audio.base64, mimeType: audio.mimeType, analysisId,
          sessionId: sessionIdRef.current ?? undefined, projectId, lineIndex: a.lineIndex,
          expected: line.text, speaker: line.speaker, sceneTitle: clip(project?.title, 600),
          emotion: line.emotion, intensity: line.intensity, action: clip(line.action, 600), deliveryNote: clip(line.deliveryNote, 600),
          contextBefore: sceneWindow(ls, a.lineIndex, -1), contextAfter: sceneWindow(ls, a.lineIndex, 1),
          measured: {
            transcript: a.spoken || undefined, asrConfidence: a.confidence,
            durationMs: Math.min(a.durationMs ?? 0, 3_600_000), longPauses: Math.min(a.longPauses ?? 0, 100),
            timeToFirstSpeechMs: Math.min(a.timeToFirstSpeechMs ?? 0, 600_000),
          },
        };
        try {
          a.delivery = await Speech.analyzeDelivery(body);
        } catch (e) {
          if (e instanceof ApiError && e.status === 402) limitHit = true;
        }
        done += 1;
        setSaveStatus({ text: 'Your coach is reviewing your delivery…', done, total: candidates.length });
      });
      if (limitHit) skipped = 'limit';
    }

    const feedback: SessionFeedback = {
      linesCompleted: played.current.size,
      totalLines: ls.length,
      redoCount: redoRef.current,
      durationSeconds: Math.round((Date.now() - startTimeRef.current) / 1000),
      confidenceScore: null,
      notes: '',
      version: 4,
      analyzedLines: analyses.filter((a) => a.analyzed).length,
      lines: analyses,
      weakLineIndices: [],
      analysisSkipped: Boolean(skipped),
      analysisSkippedReason: skipped,
    };

    // Upload the performed clips so the results page can replay the scene.
    if (user?.email !== DEMO_EMAIL) {
      setSaveStatus({ text: 'Saving your recording…' });
      const order = seqRef.current.filter((idx) => played.current.has(idx));
      const clips: RecordingClip[] = [];
      await pool(order, 4, async (idx) => {
        const line = ls[idx];
        let uri: string | null = null, mime = '', bytes = 0;
        if (line.mine) {
          const a = captures.current.get(idx)?.audio;
          if (a) { uri = a.uri; mime = a.mimeType; bytes = a.bytes; }
        } else {
          const ai = await prefetched.current.get(idx)?.catch(() => null);
          if (ai?.uri) { uri = ai.uri; mime = ai.mimeType; bytes = Math.floor((ai.base64.length * 3) / 4); }
        }
        if (!uri) return;
        try {
          const contentType = mime.split(';')[0];
          const ext = contentType.includes('wav') ? 'wav' : contentType.includes('mp4') ? 'm4a' : 'mp3';
          const ticket = await Storage.requestUploadUrl(`line-${idx}-${line.mine ? 'user' : 'ai'}.${ext}`, bytes, contentType);
          if (await putFile(ticket.uploadURL, uri, ticket.metadata?.contentType ?? contentType)) {
            clips.push({ lineIndex: idx, speaker: line.speaker, role: line.mine ? 'user' : 'ai', text: line.text, objectPath: ticket.objectPath, mimeType: contentType });
          }
        } catch { /* a dropped clip is not worth failing the save */ }
      });
      if (clips.length) feedback.recording = { clips: clips.sort((a, b) => order.indexOf(a.lineIndex) - order.indexOf(b.lineIndex)) };
    }

    setSaveStatus({ text: 'Wrapping up your session…' });
    const sid = sessionIdRef.current;
    try {
      if (!sid) throw new Error('No session');
      await Sessions.update(projectId, sid, { completedLines: feedback.linesCompleted, redoCount: redoRef.current, duration: feedback.durationSeconds, feedback });
      navigation.replace('SessionResults', { projectId, sessionId: sid });
    } catch (e) {
      Alert.alert('Could not save the session', e instanceof Error ? e.message : 'Unknown error', [
        { text: 'OK', onPress: () => navigation.reset({ index: 0, routes: [{ name: 'Main' }] }) },
      ]);
    }
  };

  const confirmAnalysis = async (usage: UsageInfo): Promise<boolean> => {
    const price = await Projects.analysisPrice(projectId).catch(() => null);
    const left = usage.analysisLimit != null ? ` You have ${Math.max(0, usage.analysisLimit - usage.analysesUsed)} left this month.` : '';
    let body = `This scores your delivery and generates coaching.${left}`;
    let cta = 'Analyze';
    if (price && price.milli > 0) {
      const credits = price.milli / 1000;
      body = `This uses ${credits} credit${credits === 1 ? '' : 's'} to score your delivery and generate coaching.${left}`;
      cta = `Use ${credits} & analyze`;
    } else if (price && price.milli === 0) {
      body = price.analysesUsed > 0
        ? 'This analysis is free — delivery scoring and coaching feedback at no credit cost.'
        : 'Your first analysis for this script is free — delivery scoring and coaching feedback at no credit cost.';
      cta = 'Analyze for free';
    }
    return new Promise((resolve) =>
      Alert.alert('Analyze this rehearsal?', body, [
        { text: 'Skip analysis', style: 'cancel', onPress: () => resolve(false) },
        { text: cta, onPress: () => resolve(true) },
      ], { cancelable: false })
    );
  };

  // ── Render ────────────────────────────────────────────────────────────
  if (!project || !lines.length) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent} size="large" />
          <Text style={[styles.loadingText, { color: theme.muted }]}>Setting the stage…</Text>
        </View>
      </Screen>
    );
  }

  const chars = myCharacters(project);
  const isFocus = Boolean(focus?.length) && seq.length < lines.length;
  const line = lines[seq[step]];
  const prev = step > 0 ? lines[seq[step - 1]] : null;
  const next = step + 1 < seq.length ? lines[seq[step + 1]] : null;
  const idle = phase === 'idle';
  const running = ['speaking', 'loading', 'my-turn'].includes(phase);
  const manual = micState !== 'granted';
  const usage = usageRef.current;
  const overLimit = Boolean(usage?.exceeded || usage?.charsExceeded);

  return (
    <Screen padded={false}>
      {/* Header */}
      <View style={styles.header}>
        <BackButton onPress={handleExit} />
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.muted }} numberOfLines={1}>{project.title}</Text>
          <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: theme.text }}>
            {chars.join(' & ')} · {isFocus ? `${seq.length} focus lines` : `${seq.length} lines`}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => void handleEnd()}
          disabled={idle || phase === 'saving'}
          style={[styles.endBtn, { borderColor: theme.border, backgroundColor: theme.surface, opacity: idle ? 0 : 1 }]}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 12, color: theme.text }}>End</Text>
        </TouchableOpacity>
      </View>

      {isFocus && !idle ? (
        <View style={[styles.focusBanner, { backgroundColor: theme.warningBg }]}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.warning }}>
            Focus mode · rehearsing your {focus!.length} weak line{focus!.length === 1 ? '' : 's'}
          </Text>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 24, marginTop: 6 }}>
        <ProgressBar progress={idle ? 0 : step / seq.length} height={3} track={theme.divider} />
      </View>

      {/* Stage */}
      <View style={styles.stage}>
        {countdown != null ? null : idle ? (
          <StartCard
            theme={theme}
            title={project.title}
            chars={chars}
            count={seq.length}
            isFocus={isFocus}
            ready={creditsChecked}
            blocked={blocked}
            manual={micState === 'denied'}
            micState={micState}
            overLimit={overLimit}
            onStart={() => void handleStart()}
            onUpgrade={() => navigation.navigate('Billing')}
            onOpenSettings={() => void openSettingsForPermission('microphone')}
          />
        ) : (
          <>
            {prev ? (
              <View style={{ opacity: 0.3, alignItems: 'center', marginBottom: 14 }}>
                <Text style={[styles.eyebrow, { color: theme.muted }]}>{prev.speaker}</Text>
                <Text style={{ fontFamily: fonts.regular, fontStyle: 'italic', fontSize: 13, color: theme.text }} numberOfLines={1}>“{prev.text}”</Text>
              </View>
            ) : null}

            <StatusPill theme={theme} phase={phase} speaker={line.speaker} listening={listening} />

            <Animated.View
              style={[
                styles.lineCard,
                {
                  backgroundColor: line.mine ? theme.accentSurface : theme.surface,
                  // Opaque borders only: Android paints a translucent border
                  // colour across the whole padding box.
                  borderColor: line.mine && phase === 'my-turn' ? theme.accent : theme.border,
                  opacity: enter,
                  transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
                },
              ]}
            >
              <Text style={[styles.speakerLabel, { color: line.mine ? theme.tpYou : theme.muted }]}>
                {line.speaker}{line.mine ? <Text style={{ opacity: 0.6 }}>  ·  You</Text> : null}
              </Text>
              <Text style={[styles.lineText, { color: theme.text }]}>“{line.text}”</Text>
              {phase === 'loading' ? (
                <View style={{ marginTop: 18 }}><Waveform color={theme.muted} bars={5} /></View>
              ) : null}
              {phase === 'my-turn' ? (
                <View style={[styles.speechPanel, { borderTopColor: theme.border }]}>
                  <View style={[styles.meterTrack, { backgroundColor: theme.surfaceAlt }]}>
                    <View style={[styles.meterFill, { width: `${Math.round(level * 100)}%`, backgroundColor: theme.tpYou }]} />
                  </View>
                  <Text style={{ fontFamily: fonts.regular, fontStyle: 'italic', fontSize: 12, color: theme.muted }}>
                    {manual ? 'Manual mode — speech isn’t being captured for this line.' : listening ? 'Recording — speak your line, then pause.' : 'Getting ready…'}
                  </Text>
                </View>
              ) : null}
            </Animated.View>

            {next && phase !== 'paused' ? (
              <Text style={{ fontFamily: fonts.regular, fontStyle: 'italic', fontSize: 12.5, color: theme.muted, opacity: 0.6, marginTop: 14, textAlign: 'center' }} numberOfLines={1}>
                Up next · {next.speaker}{next.mine ? ' (You)' : ''} — “{next.text}”
              </Text>
            ) : null}
            <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: theme.muted, opacity: 0.6, marginTop: 8 }}>
              {step + 1} / {seq.length}
            </Text>
            {notice ? (
              <View style={[styles.toast, { backgroundColor: theme.warningBg }]}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.warning, textAlign: 'center' }}>{notice}</Text>
              </View>
            ) : null}
          </>
        )}
      </View>

      {/* Action zone */}
      {!idle ? (
        <View style={{ paddingHorizontal: 24, gap: 10 }}>
          {phase === 'my-turn' ? (
            <>
              {manual ? (
                <Text style={[styles.hint, { color: theme.warning }]}>Mic access is off, so auto-advance is off. Deliver your line, then tap Done Speaking.</Text>
              ) : null}
              <TouchableOpacity onPress={() => void handleDone()} activeOpacity={0.9}>
                <LinearGradient colors={brandGradient} locations={brandGradientLocations} start={gradientStart} end={gradientEnd} style={styles.doneBtn}>
                  <PulseDot color={palette.white} />
                  <Text style={styles.doneLabel}>Done Speaking</Text>
                </LinearGradient>
              </TouchableOpacity>
              <Text style={[styles.hint, { color: theme.muted }]}>
                {manual ? 'tap when you finish your line' : 'auto-advances when you stop, or tap above'}
              </Text>
            </>
          ) : phase === 'paused' ? (
            <TouchableOpacity onPress={handleResume} activeOpacity={0.9} style={[styles.resumeBtn, { backgroundColor: theme.text }]}>
              <Feather name="play" size={16} color={theme.bg} />
              <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: theme.bg }}>Resume Scene</Text>
            </TouchableOpacity>
          ) : phase === 'error' ? (
            <>
              <Text style={[styles.hint, { color: theme.destructive }]}>{errorMsg}</Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <GradientButton small label="↺ Try again" style={{ flex: 1 }} onPress={() => void processStep(stepRef.current)} />
                <TouchableOpacity
                  onPress={() => { played.current.add(seq[step]); void processStep(step + 1); }}
                  style={[styles.skipBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}
                >
                  <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.text }}>Skip line →</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : null}
        </View>
      ) : null}

      {/* Footer controls */}
      {!idle ? (
        <View style={[styles.footer, { borderTopColor: theme.border }]}>
          <Ctl theme={theme} icon="pause" label="Pause" show={running} onPress={() => void handlePause()} />
          <Ctl theme={theme} icon="rotate-ccw" label="Redo line" show={running || phase === 'paused'} onPress={() => void handleRedo()} />
          <Ctl theme={theme} icon="arrow-left" label="Back" show disabled={step === 0} onPress={() => void handleBack()} />
          <Ctl theme={theme} icon="refresh-cw" label="Restart" show ghost onPress={() => void handleRestart()} />
        </View>
      ) : null}

      {/* Overlays */}
      {countdown != null ? (
        <View style={styles.overlay}><Text style={styles.countdown}>{countdown}</Text></View>
      ) : null}
      {prep ? (
        <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.6)' }]}>
          <View style={[styles.overlayCard, { backgroundColor: theme.surface }]}>
            <Waveform color={theme.accent2Fill} bars={7} max={26} />
            <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: theme.text, marginTop: 14 }}>Preparing your AI scene partner…</Text>
            <View style={{ width: '100%', marginTop: 14 }}><ProgressBar progress={prep.done / prep.total} height={6} /></View>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.muted, marginTop: 8 }}>{prep.done}/{prep.total} lines</Text>
          </View>
        </View>
      ) : null}
      {phase === 'saving' ? (
        <View style={[styles.overlay, { backgroundColor: theme.bg }]}>
          <Text style={{ fontSize: 40 }}>🎭</Text>
          <Text style={{ fontFamily: fonts.heavy, fontSize: 24, letterSpacing: -0.5, color: theme.text, marginTop: 10 }}>Scene complete</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: theme.muted, marginTop: 6 }}>{saveStatus.text}</Text>
          {saveStatus.total ? (
            <View style={{ width: 220, marginTop: 14, alignItems: 'center', gap: 6 }}>
              <View style={{ alignSelf: 'stretch' }}><ProgressBar progress={(saveStatus.done ?? 0) / saveStatus.total} height={6} /></View>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.muted }}>{saveStatus.done}/{saveStatus.total}</Text>
            </View>
          ) : <ActivityIndicator color={theme.accent} style={{ marginTop: 16 }} />}
        </View>
      ) : null}
      {deviceLoss ? (
        <View style={[styles.overlay, { backgroundColor: 'rgba(248,250,252,0.96)' }]}>
          <View style={[styles.overlayCard, { backgroundColor: theme.surface, alignItems: 'flex-start' }]}>
            <View style={[styles.iconTile, { backgroundColor: theme.warningBg }]}><Feather name="mic-off" size={18} color={theme.warning} /></View>
            <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: theme.text, marginTop: 10 }}>{deviceLoss}</Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted, lineHeight: 19, marginTop: 6 }}>
              Your scene is paused at line {step + 1}. Nothing you have recorded is lost — we will pick up from here.
            </Text>
            <GradientButton small label="Done, try again" style={{ marginTop: 14, alignSelf: 'stretch' }} onPress={() => void retryMic()} />
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

// ── Pieces ──────────────────────────────────────────────────────────────
type T = ReturnType<typeof useTheme>['theme'];

function StartCard({ theme, title, chars, count, isFocus, ready, blocked, manual, micState, overLimit, onStart, onUpgrade, onOpenSettings }: {
  theme: T; title: string; chars: string[]; count: number; isFocus: boolean; ready: boolean;
  blocked: { message: string; billingLocked?: boolean } | null; manual: boolean; micState: MicPermission; overLimit: boolean;
  onStart: () => void; onUpgrade: () => void; onOpenSettings: () => void;
}) {
  return (
    <View style={[styles.startCard, { backgroundColor: theme.surface, borderColor: theme.border, shadowColor: theme.shadow }]}>
      <Text style={[styles.eyebrow, { color: theme.accent2 }]}>{isFocus ? 'Focused practice' : 'Ready to rehearse'}</Text>
      <Text style={{ fontFamily: fonts.heavy, fontSize: 26, letterSpacing: -0.6, color: theme.text, textAlign: 'center', marginTop: 8 }}>{title}</Text>
      <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: theme.muted, textAlign: 'center', marginTop: 6 }}>
        You are playing <Text style={{ fontFamily: fonts.bold, color: theme.text }}>{chars.join(' & ')}</Text> · {isFocus ? `${count} lines this round` : `${count} lines total`}
      </Text>

      {micState === 'denied' && !blocked ? (
        <Notice theme={theme} text='Mic access is blocked, so auto-advance and scoring are off. Rehearse manually by tapping "Done Speaking" after each line, or' link="turn it on in Settings." onLink={onOpenSettings} />
      ) : null}
      {overLimit && !blocked ? (
        <Notice theme={theme} text="You've used all of this month's credits. You can still rehearse with cached voices." link="View usage" onLink={onUpgrade} />
      ) : null}
      {blocked ? (
        <Notice theme={theme} text={blocked.message} link={blocked.billingLocked ? undefined : 'View usage'} onLink={onUpgrade} />
      ) : null}

      <GradientButton
        label={!ready ? 'Getting your scene ready…' : isFocus ? 'Start Focused Round' : 'Start Scene'}
        disabled={!ready || Boolean(blocked)}
        onPress={onStart}
        style={{ marginTop: 22, alignSelf: 'stretch' }}
      />
      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted, marginTop: 12 }}>
        {manual ? 'tap Done Speaking after each line' : 'your partner speaks first · the mic listens on your turn'}
      </Text>
    </View>
  );
}

function Notice({ theme, text, link, onLink }: { theme: T; text: string; link?: string; onLink?: () => void }) {
  return (
    <View style={[styles.notice, { backgroundColor: theme.warningBg }]}>
      <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, color: theme.warning, lineHeight: 18 }}>
        {text}{link ? <Text onPress={onLink} style={{ fontFamily: fonts.bold, textDecorationLine: 'underline' }}> {link}</Text> : null}
      </Text>
    </View>
  );
}

function StatusPill({ theme, phase, speaker, listening }: { theme: T; phase: Phase; speaker: string; listening: boolean }) {
  let bg = theme.surfaceAlt, fg = theme.muted, body: React.ReactNode = null;
  if (phase === 'loading') body = <><Waveform color={theme.muted} bars={3} min={4} max={8} width={5} /><Text style={[styles.pillText, { color: fg }]}>Generating voice…</Text></>;
  else if (phase === 'speaking') { fg = theme.text; body = <><Waveform color={theme.tpPartner} bars={5} /><Text style={[styles.pillText, { color: fg }]}>{speaker}</Text></>; }
  else if (phase === 'my-turn') { bg = theme.accentBg; fg = theme.tpYou; body = <><PulseDot color={theme.tpYou} /><Text style={[styles.pillText, { color: fg }]}>{listening ? 'Recording…' : 'Your line'}</Text>{listening ? <Waveform color={theme.tpYou} bars={4} /> : null}</>; }
  else if (phase === 'paused') body = <Text style={[styles.pillText, { color: fg }]}>Paused</Text>;
  else if (phase === 'error') { bg = 'rgba(220,38,38,0.10)'; fg = theme.destructive; body = <Text style={[styles.pillText, { color: fg }]}>Voice error</Text>; }
  else return <View style={{ height: 34 }} />;
  return <View style={[styles.pill, { backgroundColor: bg }]}>{body}</View>;
}

function PulseDot({ color }: { color: string }) {
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 0.3, duration: 700, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v]);
  return <Animated.View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: v }} />;
}

function Ctl({ theme, icon, label, show, disabled, ghost, onPress }: {
  theme: T; icon: keyof typeof Feather.glyphMap; label: string; show: boolean; disabled?: boolean; ghost?: boolean; onPress: () => void;
}) {
  if (!show) return <View style={{ flex: 1 }} />;
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.ctl, { borderColor: ghost ? 'transparent' : theme.border, backgroundColor: ghost ? 'transparent' : theme.surface, opacity: disabled ? 0.3 : ghost ? 0.6 : 1 }]}
    >
      <Feather name={icon} size={15} color={theme.muted} />
      <Text style={{ fontFamily: fonts.semibold, fontSize: 11, color: theme.muted }}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingText: { fontFamily: fonts.semibold, fontSize: 13 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 24, paddingVertical: 8 },
  endBtn: { borderWidth: 1, borderRadius: radii.pill, paddingHorizontal: 16, height: 44, alignItems: 'center', justifyContent: 'center' },
  focusBanner: { alignItems: 'center', paddingVertical: 6, marginTop: 4 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: radii.pill, paddingHorizontal: 14, height: 34, marginBottom: 16 },
  pillText: { fontFamily: fonts.semibold, fontSize: 13 },
  lineCard: { alignSelf: 'stretch', borderWidth: 2, borderRadius: radii.card, paddingVertical: 28, paddingHorizontal: 22, alignItems: 'center' },
  speakerLabel: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 14 },
  lineText: { fontFamily: fonts.medium, fontSize: 25, lineHeight: 34, letterSpacing: -0.3, textAlign: 'center' },
  speechPanel: { alignSelf: 'stretch', borderTopWidth: 1, marginTop: 20, paddingTop: 14, gap: 10, alignItems: 'center' },
  meterTrack: { alignSelf: 'stretch', height: 8, borderRadius: 4, overflow: 'hidden' },
  meterFill: { height: '100%', borderRadius: 4 },
  toast: { marginTop: 14, borderRadius: radii.tile, paddingVertical: 8, paddingHorizontal: 12 },
  hint: { fontFamily: fonts.regular, fontSize: 12.5, textAlign: 'center', lineHeight: 18 },
  doneBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: radii.card, paddingVertical: 20, shadowColor: palette.blue, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  doneLabel: { fontFamily: fonts.bold, fontSize: 18, color: palette.white, letterSpacing: 0.3 },
  resumeBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radii.card, paddingVertical: 18 },
  skipBtn: { flex: 1, borderWidth: 1, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  footer: { flexDirection: 'row', gap: 8, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 6, marginTop: 14, borderTopWidth: 1 },
  ctl: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 44, borderWidth: 1, borderRadius: radii.pill },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 24 },
  overlayCard: { alignSelf: 'stretch', borderRadius: radii.card, padding: 22, alignItems: 'center' },
  countdown: { fontFamily: fonts.heavy, fontSize: 112, color: palette.white, fontVariant: ['tabular-nums'] },
  startCard: { alignSelf: 'stretch', borderWidth: 2, borderRadius: radii.card, padding: 24, alignItems: 'center', shadowOpacity: 1, shadowRadius: 3, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  notice: { alignSelf: 'stretch', borderRadius: radii.tile, padding: 12, marginTop: 16 },
  iconTile: { width: 36, height: 36, borderRadius: radii.tile, alignItems: 'center', justifyContent: 'center' },
});
