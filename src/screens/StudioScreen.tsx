import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Modal, ScrollView, Animated } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType } from 'expo-camera';
import { useKeepAwake } from 'expo-keep-awake';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useToast } from '../components/Toast';
import { Projects, Tts, Voices, playableLines } from '../api';
import { cacheClip, leaveRehearsalAudioMode, playClip, stopPlayback } from '../lib/audio';
import { buildPrepLines, estimateDuration } from '../lib/rehearsal';
import { explainPermission, openSettingsForPermission } from '../lib/permissions';
import { useReduceMotion } from '../lib/motion';
import { fonts, radii, palette, stageSurfaces, RED_DOT, PRESS_OPACITY, controlChip, controlPill } from '../theme';
import type { PlayableLine, Project, RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Studio'>;

const DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL';
type Phase = 'idle' | 'ai-speaking' | 'user-turn' | 'paused' | 'done';
type Stage = null | 'checking' | 'camera' | 'voices';
type CueMode = 'full' | 'cue' | 'hide';

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const fmt = (ms: number) => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

// The web's Studio in self-tape mode: credits check → camera → the partner's
// lines are generated up front → count-in → the camera records while the AI
// partner reads every other role. Your lines advance with "Next line" — the
// camera owns the microphone while it records, so the web's silence detection
// isn't available here.
//
// Opening Reading aids pauses the scene AND the recording, as the web does;
// closing them leaves a Resume button, so nothing moves until the actor is
// ready. Flipping the camera mid-take ends that recording (the camera has to
// rebind), so — like the web when a take can't continue — it starts a new take
// from the current line after a fresh count-in.
export default function StudioScreen({ navigation, route }: Props) {
  const projectId = route.params?.id;
  const countdownSec = [0, 3, 5, 10].includes(route.params?.countdown ?? -1) ? route.params!.countdown! : 3;
  const toast = useToast();
  useKeepAwake();
  const cameraRef = useRef<CameraView | null>(null);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const [cameraReady, setCameraReady] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [lines, setLines] = useState<PlayableLine[]>([]);
  const [stage, setStage] = useState<Stage>('checking');
  const [prep, setPrep] = useState<{ done: number; total: number } | null>(null);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [phase, setPhase] = useState<Phase>('idle');
  const [recording, setRecordingState] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  // Reading aids — they change how the script looks, never the recording.
  const [aidsOpen, setAidsOpen] = useState(false);
  const [textScale, setTextScale] = useState(1);
  const [eyeline, setEyeline] = useState(0.42);
  const [cueMode, setCueMode] = useState<CueMode>('full');
  const [mirror, setMirror] = useState(false);
  const [captions, setCaptions] = useState(true);

  const clips = useRef<Map<number, string>>(new Map());
  const phaseRef = useRef<Phase>('idle');
  const stepRef = useRef(0);
  const linesRef = useRef<PlayableLine[]>([]);
  const skipped = useRef<number[]>([]);
  const startedAt = useRef(0);
  const discard = useRef(false);
  const alive = useRef(true);
  const setPh = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  const recordingRef = useRef(false);
  const setRecording = (r: boolean) => { recordingRef.current = r; setRecordingState(r); };
  // Bumped per recording: a take ended by a flip resolves late and is ignored.
  const recToken = useRef(0);
  // Paused time is cut from the take's clock so the timer matches the video.
  const recPaused = useRef(false);
  const pausedAt = useRef(0);
  const pausedTotal = useRef(0);
  const takeMs = () => Date.now() - startedAt.current - pausedTotal.current - (recPaused.current ? Date.now() - pausedAt.current : 0);
  const aidsOpenRef = useRef(false);
  const rollFrom = useRef(0);
  const insets = useSafeAreaInsets();

  const granted = !!(camPerm?.granted && micPerm?.granted);

  const leave = useCallback((title: string, message: string) => {
    discard.current = true;
    cameraRef.current?.stopRecording();
    void stopPlayback();
    Alert.alert(title, message);
    navigation.goBack();
  }, [navigation]);

  // ── 1. Load + credits check (nothing records before this passes) ──
  useEffect(() => {
    alive.current = true;
    if (!projectId) { navigation.goBack(); return; }
    void (async () => {
      try {
        const [p, assigns] = await Promise.all([Projects.get(projectId), Voices.forProject(projectId).catch(() => [])]);
        if (!alive.current) return;
        const ls = playableLines(p);
        if (!ls.length || !ls.some((l) => l.mine)) {
          leave('Set up this script first', 'Pick the character you are playing before recording a self-tape.');
          return;
        }
        const voiceOf = (s: string) => assigns.find((a) => a.speaker === s)?.voiceId ?? DEFAULT_VOICE;
        const prepLines = buildPrepLines(ls, (l) => !(l as PlayableLine).mine, voiceOf);
        if (prepLines.length) {
          const batch = { profile: 'enhanced' as const, sceneTitle: p.title, projectId, lines: prepLines };
          const v = await Tts.preflight(batch);
          if (!alive.current) return;
          if (!v.allowed) {
            const out = (v.code ?? 'insufficient_voice_allowance') === 'insufficient_voice_allowance';
            leave(
              out ? 'Not enough AI voice credits' : 'Your self-tape couldn’t start',
              `${v.error ?? 'You don’t have enough AI voice credits remaining to start this session.'}\n\n${out ? 'Your self-tape didn’t start, so nothing was recorded and no credits were used.' : 'Your self-tape didn’t start. Nothing was recorded.'}`
            );
            return;
          }
        }
        linesRef.current = ls;
        setProject(p);
        setLines(ls);
        setStage('camera');

        // ── 3. Generate every partner line now, so the take never waits ──
        const aiSteps = ls.map((l, i) => (l.mine ? -1 : i)).filter((i) => i >= 0);
        if (aiSteps.length) {
          await Tts.pregenerate({ profile: 'enhanced', sceneTitle: p.title, projectId, lines: prepLines }).catch(() => null);
          let done = 0, cursor = 0, ok = true;
          setPrep({ done: 0, total: aiSteps.length });
          const worker = async () => {
            while (cursor < aiSteps.length && alive.current) {
              const s = aiSteps[cursor++];
              const l = ls[s], prev = ls[s - 1], next = ls[s + 1];
              try {
                const res = await Tts.speak({
                  text: l.text, voiceId: voiceOf(l.speaker), profile: 'enhanced', speaker: l.speaker, sceneTitle: p.title, projectId,
                  contextBefore: prev ? `${prev.speaker}: ${prev.text}` : undefined,
                  contextAfter: next ? `${next.speaker}: ${next.text}` : undefined,
                  action: [l.action, l.deliveryNote].filter((v) => v?.trim()).join('; ') || undefined,
                  emotion: l.emotion, intensity: l.intensity, audioTags: l.audioTags,
                });
                clips.current.set(s, res.mock ? `mock:${estimateDuration(l.text)}` : await cacheClip(`st-${hash(`${voiceOf(l.speaker)}|${l.text}`)}`, res.audioBase64, res.mimeType));
              } catch {
                ok = false;
              } finally {
                done++;
                if (alive.current) setPrep({ done, total: aiSteps.length });
              }
            }
          };
          await Promise.all(Array.from({ length: Math.min(3, aiSteps.length) }, worker));
          if (!alive.current) return;
          if (!ok) {
            leave('Your self-tape couldn’t start', 'Some of your scene partner’s lines couldn’t be generated. Your self-tape didn’t start. Nothing was recorded.');
            return;
          }
        }
        setPrep(null);
        setStage(null);
      } catch (e) {
        leave("Couldn't open the Studio", e instanceof Error ? e.message : 'Please try again.');
      }
    })();
    return () => {
      alive.current = false;
      void stopPlayback();
      void leaveRehearsalAudioMode();
    };
  }, [projectId]);

  // ── 2. Camera + mic, staged like the rest of the app ──
  const askedRef = useRef(false);
  const askForAccess = async () => {
    const blocked = (camPerm && !camPerm.granted && !camPerm.canAskAgain) || (micPerm && !micPerm.granted && !micPerm.canAskAgain);
    if (blocked) { await openSettingsForPermission('camera'); return; }
    if (!(await explainPermission('camera'))) return;
    if (!camPerm?.granted) await requestCamPerm();
    if (!micPerm?.granted) await requestMicPerm();
  };
  useEffect(() => {
    if (!camPerm || !micPerm || askedRef.current || granted) return;
    askedRef.current = true;
    void askForAccess();
  }, [camPerm, micPerm]);

  // ── 4. Count in, then roll ──
  const startedRef = useRef(false);
  useEffect(() => {
    if (stage !== null || !granted || !cameraReady || startedRef.current) return;
    startedRef.current = true;
    void (async () => {
      // The count-in holds while Reading aids are open.
      const waitAids = async () => { while (aidsOpenRef.current && alive.current) await sleep(200); };
      for (let n = countdownSec; n > 0 && alive.current; n--) {
        await waitAids();
        setCountdown(n);
        await sleep(1000);
      }
      await waitAids();
      setCountdown(null);
      if (!alive.current) return;
      void record();
      run(rollFrom.current);
    })();
  }, [stage, granted, cameraReady]);

  const record = async () => {
    if (!cameraRef.current) return;
    const token = ++recToken.current;
    setRecording(true);
    startedAt.current = Date.now();
    pausedTotal.current = 0;
    recPaused.current = false;
    setElapsed(0);
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 600 });
      if (token !== recToken.current) return;
      setRecording(false);
      if (!video?.uri || discard.current || !alive.current) return;
      if (skipped.current.length) {
        toast({ title: `${skipped.current.length} line${skipped.current.length === 1 ? '' : 's'} couldn't be voiced`, description: 'Your scene partner skipped them so the take could keep running.', variant: 'destructive' });
      }
      navigation.replace('TakeReview', { id: projectId, uri: video.uri, durationMs: Math.max(1000, takeMs()) });
    } catch {
      if (token === recToken.current) setRecording(false);
    }
  };

  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setElapsed(takeMs()), 250);
    return () => clearInterval(id);
  }, [recording]);

  // ── 5. The scene: the partner speaks, you speak, "Next line" moves on ──
  const run = (s: number) => {
    const ls = linesRef.current;
    if (s >= ls.length) { setPh('done'); cameraRef.current?.stopRecording(); return; }
    stepRef.current = s;
    setStep(s);
    if (ls[s].mine) { setPh('user-turn'); return; }
    setPh('ai-speaking');
    const clip = clips.current.get(s);
    const advance = () => { if (phaseRef.current !== 'paused' && stepRef.current === s && alive.current) run(s + 1); };
    if (!clip) { skipped.current.push(s); advance(); return; }
    if (clip.startsWith('mock:')) setTimeout(advance, Number(clip.slice(5)));
    else void playClip(clip, true).then(advance);
  };

  const nextLine = () => { if (phaseRef.current === 'user-turn') run(stepRef.current + 1); };
  // Pause stops the partner, holds the line, and pauses the recording itself
  // where the camera supports it (Android; iOS 18+).
  const pause = () => {
    const ph = phaseRef.current;
    if (ph === 'idle' || ph === 'done' || ph === 'paused') return;
    void stopPlayback();
    setPh('paused');
    if (!recordingRef.current || recPaused.current) return;
    let canToggle = false;
    try { canToggle = !!cameraRef.current?.getSupportedFeatures().toggleRecordingAsyncAvailable; } catch {}
    if (!canToggle) return;
    recPaused.current = true;
    pausedAt.current = Date.now();
    cameraRef.current?.toggleRecordingAsync().catch(() => { recPaused.current = false; });
  };
  const resume = () => {
    if (recPaused.current) {
      pausedTotal.current += Date.now() - pausedAt.current;
      recPaused.current = false;
      cameraRef.current?.toggleRecordingAsync().catch(() => {});
    }
    run(stepRef.current);
  };
  const openAids = () => { aidsOpenRef.current = true; setAidsOpen(true); pause(); };
  const closeAids = () => { aidsOpenRef.current = false; setAidsOpen(false); };

  const flip = () => {
    const toggle = () => { setCameraReady(false); setFacing((f) => (f === 'front' ? 'back' : 'front')); };
    if (countdown !== null) return; // the take is about to start recording
    if (!recordingRef.current) { toggle(); return; }
    pause();
    Alert.alert('Flip camera?', 'Switching cameras ends this recording. A new take starts from this line after a short count-in.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Flip & restart',
        onPress: () => {
          recToken.current += 1;
          cameraRef.current?.stopRecording();
          setRecording(false);
          skipped.current = [];
          rollFrom.current = stepRef.current;
          startedRef.current = false;
          toggle();
        },
      },
    ]);
  };
  const stop = () => { void stopPlayback(); setPh('done'); cameraRef.current?.stopRecording(); };
  const close = () => {
    const quit = () => { discard.current = true; cameraRef.current?.stopRecording(); void stopPlayback(); navigation.goBack(); };
    if (!recording) { quit(); return; }
    Alert.alert('Stop this take?', 'This take is discarded.', [{ text: 'Keep recording', style: 'cancel' }, { text: 'Discard', style: 'destructive', onPress: quit }]);
  };

  // ── Render ──
  if (camPerm && micPerm && !granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.center}>
          <Feather name="video-off" size={40} color={stageSurfaces.onDarkSubtle} />
          <Text style={styles.permTitle}>Enable your camera & mic to record a self-tape.</Text>
          <Text style={styles.permText}>Record yourself on camera while your AI scene partner reads the other roles live.</Text>
          <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={() => void askForAccess()} style={styles.primary} accessibilityRole="button">
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: palette.white }}>
              {(camPerm && !camPerm.canAskAgain) || (micPerm && !micPerm.canAskAgain) ? 'Open Settings' : 'Enable Camera & Mic'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={() => navigation.goBack()} style={{ minHeight: 44, justifyContent: 'center' }} accessibilityRole="button">
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: stageSurfaces.onDarkSubtle }}>Back to the script</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const current = lines[step];
  const prev = lines[step - 1];
  const nextL = lines[step + 1];
  const yourText = (l: PlayableLine) =>
    cueMode === 'full' ? l.text : cueMode === 'cue' ? `${l.text.split(/\s+/)[0] ?? ''} …` : '• • •';
  const stageCopy: Record<Exclude<Stage, null>, [string, string]> = {
    checking: ['Checking your credits…', 'Making sure this scene can run before anything starts recording.'],
    camera: ['Turning on your camera…', 'If your phone asks for permission, choose Allow.'],
    voices: ['Getting your scene partner ready…', 'Their lines are being generated now, so the scene plays without pauses.'],
  };
  const showStage: Exclude<Stage, null> | null = stage === 'camera' && prep ? 'voices' : stage;

  return (
    <View style={styles.safe}>
      <StatusBar style="light" />
      {granted ? (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing={facing} mode="video" mirror={facing === 'front'} onCameraReady={() => setCameraReady(true)} />
      ) : null}

      <SafeAreaView style={styles.chrome}>
        <View style={styles.topRow}>
          <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={close} hitSlop={8} accessibilityRole="button" accessibilityLabel="Back to script" style={styles.chip}>
            <Feather name="chevron-left" size={15} color={palette.white} />
            <Text style={styles.chipText}>Back to script</Text>
          </TouchableOpacity>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {granted && !recording && countdown === null ? (
              <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={flip} accessibilityRole="button" accessibilityLabel="Flip camera" style={styles.chip}><Text style={styles.chipText}>⟲ Flip</Text></TouchableOpacity>
            ) : null}
            <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={openAids} accessibilityRole="button" style={styles.chip}><Text style={styles.chipText}>⚙ Aids</Text></TouchableOpacity>
          </View>
        </View>

        {/* The web's floating marks: a red REC pill and the scene status. */}
        {countdown === null && (recording || (phase !== 'idle' && phase !== 'done')) ? (
          <View style={styles.markRow} pointerEvents="none">
            {phase !== 'idle' && phase !== 'done' ? (
              <View style={[styles.mark, { backgroundColor: phase === 'user-turn' ? palette.blue : 'rgba(255,255,255,0.15)' }]}>
                {phase === 'user-turn' ? <Pulse /> : null}
                <Text style={styles.markText}>
                  {phase === 'user-turn' ? 'Your line' : phase === 'ai-speaking' ? 'Partner speaking…' : 'Paused'}
                  <Text style={{ opacity: 0.65, fontFamily: fonts.regular }}>  · {Math.min(step + 1, lines.length)}/{lines.length}</Text>
                </Text>
              </View>
            ) : null}
            {recording ? (
              <View style={[styles.mark, { backgroundColor: 'rgba(220,38,38,0.9)' }]} accessibilityLabel={`Recording, ${fmt(elapsed)}`}>
                {phase === 'paused' ? <View style={styles.markDot} /> : <Pulse />}
                <Text style={styles.markText}>REC <Text style={{ fontFamily: fonts.regular }}>{fmt(elapsed)}</Text></Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {showStage ? (
          <View style={styles.center}>
            <ActivityIndicator color={palette.cyanBright} />
            <Text style={styles.stageTitle}>{stageCopy[showStage][0]}</Text>
            <Text style={styles.stageBody}>{stageCopy[showStage][1]}</Text>
            {prep && prep.total ? <Text style={styles.stageBody}>Preparing voices… {prep.done} / {prep.total}</Text> : null}
          </View>
        ) : countdown !== null ? (
          <View style={styles.center} pointerEvents="none"><Text style={styles.count}>{countdown}</Text></View>
        ) : (
          <View style={{ flex: 1, justifyContent: 'flex-start', paddingTop: `${Math.round(eyeline * 60)}%` }}>
            {captions && current ? (
              <View style={[styles.prompter, mirror && { transform: [{ scaleX: -1 }] }]}>
                {prev ? <Text numberOfLines={1} style={[styles.dim, { fontSize: 13 * textScale }]}>{prev.speaker}: {prev.mine ? yourText(prev) : prev.text}</Text> : null}
                <Text style={[styles.speaker, { color: current.mine ? palette.white : palette.cyanBright }]}>
                  {current.mine ? `YOU · ${current.speaker}` : phase === 'ai-speaking' ? `${current.speaker} · Partner speaking…` : current.speaker}
                </Text>
                <Text style={[styles.line, { fontSize: 21 * textScale, lineHeight: 30 * textScale, color: current.mine ? palette.white : palette.cyanBright }]}>
                  {current.mine ? yourText(current) : current.text}
                </Text>
                {nextL ? <Text numberOfLines={1} style={[styles.dim, { fontSize: 13 * textScale, marginTop: 8 }]}>{nextL.speaker}: {nextL.mine ? yourText(nextL) : nextL.text}</Text> : null}
              </View>
            ) : null}
          </View>
        )}

        {!showStage && countdown === null && phase !== 'idle' && phase !== 'done' ? (
          <View style={styles.controls}>
            <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={flip} accessibilityRole="button" accessibilityLabel="Flip camera" style={styles.side}>
              <Text style={styles.chipText}>⟲ Flip</Text>
            </TouchableOpacity>
            {phase === 'paused' ? (
              <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={resume} accessibilityRole="button" style={styles.primary}><Text style={styles.primaryText}>Resume</Text></TouchableOpacity>
            ) : phase === 'user-turn' ? (
              <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={nextLine} accessibilityRole="button" style={styles.primary}><Text style={styles.primaryText}>Next line</Text></TouchableOpacity>
            ) : (
              <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={pause} accessibilityRole="button" style={styles.side}><Text style={styles.chipText}>⏸ Pause</Text></TouchableOpacity>
            )}
            <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={stop} accessibilityRole="button" accessibilityLabel="Finish take" style={styles.recOuter}>
              <View style={styles.recInner} />
            </TouchableOpacity>
          </View>
        ) : null}
      </SafeAreaView>

      <Modal visible={aidsOpen} transparent animationType="slide" onRequestClose={closeAids} statusBarTranslucent navigationBarTranslucent>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeAids} accessibilityLabel="Close reading aids" />
        <View style={styles.aids}>
          {/* Bottom inset: the last aid must clear the gesture bar / 3-button nav. */}
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 20 + insets.bottom, gap: 16 }}>
            <View>
              <Text style={styles.aidsTitle}>Reading aids</Text>
              <Text style={styles.aidsHelp}>Tune the teleprompter to help you rehearse. They change how the script looks while you run the scene — they don't change your recording.</Text>
            </View>
            <Aid label="Text size" help="How large the lines appear." options={[['0.85', 'S'], ['1', 'M'], ['1.25', 'L'], ['1.5', 'XL']]} value={String(textScale)} onPick={(v) => setTextScale(Number(v))} />
            <Aid label="Eyeline" help="Where the active line sits, so your gaze stays near the lens." options={[['0.1', 'High'], ['0.42', 'Middle'], ['0.8', 'Low']]} value={String(eyeline)} onPick={(v) => setEyeline(Number(v))} />
            <Aid label="Cue level" help="How much of your lines to show — full text, a first-word cue, or hidden to test memory." options={[['full', 'Full'], ['cue', 'Cue'], ['hide', 'Hide']]} value={cueMode} onPick={(v) => setCueMode(v as CueMode)} />
            <Aid label="Mirror" help="Flips the text for teleprompter glass / reflector rigs." options={[['off', 'Off'], ['on', 'On']]} value={mirror ? 'on' : 'off'} onPick={(v) => setMirror(v === 'on')} />
            <Aid label="Captions" help="Show or hide the script text over your camera. Off gives you a clean frame." options={[['on', 'On'], ['off', 'Off']]} value={captions ? 'on' : 'off'} onPick={(v) => setCaptions(v === 'on')} />
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// The web's `animate-pulse` dot; holds still under Reduce Motion.
function Pulse() {
  const reduceMotion = useReduceMotion();
  const v = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduceMotion) { v.setValue(1); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(v, { toValue: 0.35, duration: 700, useNativeDriver: true }),
      Animated.timing(v, { toValue: 1, duration: 700, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [v, reduceMotion]);
  return <Animated.View style={[styles.markDot, { opacity: v }]} />;
}

function Aid({ label, help, options, value, onPick }: { label: string; help: string; options: Array<[string, string]>; value: string; onPick: (v: string) => void }) {
  return (
    <View>
      <Text style={{ fontFamily: fonts.bold, fontSize: 13.5, color: palette.white }}>{label}</Text>
      <Text style={styles.aidsHelp}>{help}</Text>
      <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
        {options.map(([v, l]) => (
          <TouchableOpacity activeOpacity={PRESS_OPACITY} key={v} onPress={() => onPick(v)} accessibilityRole="button" accessibilityState={{ selected: v === value }} style={[styles.aidOpt, v === value && { backgroundColor: palette.blue, borderColor: palette.blue }]}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: palette.white }}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: stageSurfaces.bg },
  chrome: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 8 },
  chip: { ...controlChip, backgroundColor: 'rgba(0,0,0,0.45)' },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: palette.white },
  markRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: 8, marginTop: 10, paddingHorizontal: 16 },
  mark: { flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: radii.pill, paddingHorizontal: 13, paddingVertical: 6 },
  markText: { fontFamily: fonts.semibold, fontSize: 12.5, color: palette.white },
  markDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.white },
  stageTitle: { fontFamily: fonts.heavy, fontSize: 20, color: palette.white, textAlign: 'center' },
  stageBody: { fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20, color: stageSurfaces.onDarkMuted, textAlign: 'center' },
  count: { fontFamily: fonts.heavy, fontSize: 120, color: 'rgba(255,255,255,0.9)', letterSpacing: -4 },
  prompter: { marginHorizontal: 16, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: radii.card, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)' },
  dim: { fontFamily: fonts.regular, color: 'rgba(255,255,255,0.5)' },
  speaker: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1, marginTop: 8, marginBottom: 6 },
  line: { fontFamily: fonts.semibold },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingBottom: 20 },
  side: { ...controlPill, minWidth: 80, backgroundColor: 'rgba(0,0,0,0.45)' },
  primary: { minHeight: 48, paddingHorizontal: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.blue, borderRadius: radii.pill },
  primaryText: { fontFamily: fonts.bold, fontSize: 15, color: palette.white },
  recOuter: { width: 64, height: 64, borderRadius: 32, borderWidth: 4, borderColor: palette.white, alignItems: 'center', justifyContent: 'center' },
  recInner: { width: 26, height: 26, borderRadius: 6, backgroundColor: RED_DOT },
  permTitle: { fontFamily: fonts.heavy, fontSize: 20, color: palette.white, textAlign: 'center' },
  permText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: stageSurfaces.onDarkMuted, textAlign: 'center' },
  aids: { backgroundColor: stageSurfaces.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '75%' },
  aidsTitle: { fontFamily: fonts.heavy, fontSize: 18, color: palette.white },
  aidsHelp: { fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: stageSurfaces.onDarkMuted, marginTop: 3 },
  aidOpt: { ...controlChip, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
});
