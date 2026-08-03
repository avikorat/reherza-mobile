import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { CameraView, useCameraPermissions, useMicrophonePermissions, type CameraType } from 'expo-camera';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Projects, myCharacters, playableLines } from '../api';
import { fonts, RED_DOT } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Studio'>;

// Self-tape studio — records real video with the front camera and hands the
// clip to TakeReview, which uploads it via the storage + selftapes endpoints.
export default function StudioScreen({ navigation, route }: Props) {
  const projectId = route.params?.id;
  const cameraRef = useRef<CameraView | null>(null);
  const [camPerm, requestCamPerm] = useCameraPermissions();
  const [micPerm, requestMicPerm] = useMicrophonePermissions();
  const [facing, setFacing] = useState<CameraType>('front');
  const [ready, setReady] = useState(false);
  const [count, setCount] = useState(3);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [prompt, setPrompt] = useState<{ speaker: string; text: string } | null>(null);
  const stoppedRef = useRef(false);
  const navigatedRef = useRef(false);

  // Ask for camera + mic up front.
  useEffect(() => {
    void (async () => {
      if (!camPerm?.granted) await requestCamPerm();
      if (!micPerm?.granted) await requestMicPerm();
    })();
  }, []);

  // Teleprompter: the user's first line from the project.
  useEffect(() => {
    if (!projectId) return;
    Projects.get(projectId)
      .then((p) => {
        const mine = myCharacters(p);
        const line = playableLines(p).find((l) =>
          mine.length ? mine.includes(l.speaker) : l.role === 'user'
        );
        if (line) setPrompt({ speaker: line.speaker, text: line.text });
      })
      .catch(() => {});
  }, [projectId]);

  const granted = Boolean(camPerm?.granted && micPerm?.granted);

  // Countdown once the camera is live, then start rolling.
  useEffect(() => {
    if (!granted || !ready || count <= 0) return;
    const t = setTimeout(() => setCount((c) => c - 1), 900);
    return () => clearTimeout(t);
  }, [granted, ready, count]);

  useEffect(() => {
    if (granted && ready && count === 0 && !recording) void startRecordingNow();
  }, [granted, ready, count]);

  // REC clock.
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  // Keep the latest elapsed value readable from the recordAsync closure.
  const elapsedRef = useRef(0);
  useEffect(() => {
    elapsedRef.current = elapsed;
  }, [elapsed]);

  const startRecordingNow = async () => {
    if (!cameraRef.current || recording) return;
    setRecording(true);
    stoppedRef.current = false;
    try {
      const video = await cameraRef.current.recordAsync({ maxDuration: 300 });
      // stoppedRef is set by Close/Redo — those takes are discarded.
      if (video?.uri && !stoppedRef.current && !navigatedRef.current) {
        navigatedRef.current = true;
        navigation.replace('TakeReview', {
          id: projectId,
          uri: video.uri,
          durationMs: (elapsedRef.current || 1) * 1000,
        });
      } else {
        setRecording(false);
      }
    } catch {
      setRecording(false);
    }
  };

  const stop = () => {
    if (!recording) return;
    stoppedRef.current = false; // let the resolved promise navigate
    cameraRef.current?.stopRecording();
    // Watchdog: some emulators (Expo Go SDK 51) never finalize the video —
    // don't leave the user stuck on a REC screen if that happens.
    setTimeout(() => {
      if (!navigatedRef.current) {
        stoppedRef.current = true;
        setRecording(false);
        Alert.alert(
          'Recording not finalized',
          'The camera could not finalize this video. On emulators this is a known Expo Go limitation — use a development build or a real device for self-tapes.'
        );
      }
    }, 8000);
  };

  const close = () => {
    stoppedRef.current = true;
    if (recording) cameraRef.current?.stopRecording();
    navigation.goBack();
  };

  const redo = () => {
    if (recording) {
      stoppedRef.current = true;
      cameraRef.current?.stopRecording();
    }
    setRecording(false);
    setElapsed(0);
    setCount(3);
  };

  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;

  if (camPerm && micPerm && !granted) {
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="light" />
        <View style={styles.permWrap}>
          <Feather name="video-off" size={40} color="rgba(255,255,255,0.6)" />
          <Text style={styles.permTitle}>Camera & mic needed</Text>
          <Text style={styles.permText}>
            Self-tapes record video and audio. Allow camera and microphone access to use the Studio.
          </Text>
          <TouchableOpacity
            onPress={async () => {
              await requestCamPerm();
              await requestMicPerm();
            }}
            style={styles.permBtn}
          >
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: '#fff' }}>Allow access</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 14 }}>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>Go back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      {granted ? (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="video"
          onCameraReady={() => setReady(true)}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#101012', alignItems: 'center', justifyContent: 'center' }]}>
          <ActivityIndicator color="#F5A623" />
        </View>
      )}

      <View style={styles.topRow}>
        <TouchableOpacity onPress={close} style={styles.chip}>
          <Text style={styles.chipText}>✕ Close</Text>
        </TouchableOpacity>
        <View style={styles.chip}>
          <View style={[styles.recDot, !recording && { backgroundColor: 'rgba(255,255,255,0.4)' }]} />
          <Text style={styles.chipText}>{recording ? `REC ${clock}` : 'STANDBY'}</Text>
        </View>
      </View>

      <View style={styles.countWrap} pointerEvents="none">
        {granted && ready && count > 0 ? <Text style={styles.count}>{count}</Text> : null}
      </View>

      <View style={styles.prompter}>
        <Text style={styles.prompterLabel}>
          TELEPROMPTER{prompt ? ` · ${prompt.speaker}` : ''}
        </Text>
        <Text style={styles.prompterText} numberOfLines={3}>
          {prompt ? prompt.text : 'Deliver your line to camera. Tap the red button to finish the take.'}
        </Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity onPress={() => setFacing((f) => (f === 'front' ? 'back' : 'front'))} style={styles.sideBtn}>
          <View style={styles.sideIcon}>
            <Feather name="repeat" size={22} color="#fff" />
          </View>
          <Text style={styles.sideLabel}>Flip</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={recording ? stop : () => void startRecordingNow()}
          accessibilityRole="button"
          accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
          style={styles.recOuter}
        >
          <View style={[styles.recInner, recording && styles.recInnerActive]} />
        </TouchableOpacity>

        <TouchableOpacity onPress={redo} style={styles.sideBtn}>
          <View style={styles.sideIcon}>
            <Feather name="refresh-cw" size={22} color="#fff" />
          </View>
          <Text style={styles.sideLabel}>Redo</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b0b0c' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginTop: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: 'rgba(0,0,0,0.4)', paddingVertical: 7, paddingHorizontal: 13, borderRadius: 999,
  },
  chipText: { fontFamily: fonts.semibold, fontSize: 13, color: '#fff' },
  recDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: RED_DOT },
  countWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  count: { fontFamily: fonts.serifBold, fontSize: 120, color: 'rgba(255,255,255,0.9)', lineHeight: 130 },
  prompter: {
    marginHorizontal: 16, marginBottom: 20, backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 16, padding: 18, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  prompterLabel: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 1, color: '#F5A623', marginBottom: 8 },
  prompterText: { fontFamily: fonts.regular, fontSize: 19, lineHeight: 28, color: '#fff' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 34, paddingBottom: 24 },
  sideBtn: { alignItems: 'center', gap: 5 },
  sideIcon: { width: 48, height: 48, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  sideLabel: { fontFamily: fonts.semibold, fontSize: 10, color: '#fff' },
  recOuter: { width: 80, height: 80, borderRadius: 40, borderWidth: 4, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  recInner: {
    width: 60, height: 60, borderRadius: 30, backgroundColor: RED_DOT,
    shadowColor: RED_DOT, shadowOpacity: 0.5, shadowRadius: 24, shadowOffset: { width: 0, height: 0 },
  },
  recInnerActive: { width: 34, height: 34, borderRadius: 8 },
  permWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, gap: 12 },
  permTitle: { fontFamily: fonts.heavy, fontSize: 22, color: '#fff' },
  permText: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: 'rgba(255,255,255,0.7)', textAlign: 'center' },
  permBtn: { marginTop: 10, backgroundColor: '#C21807', paddingHorizontal: 26, paddingVertical: 13, borderRadius: 999 },
});
