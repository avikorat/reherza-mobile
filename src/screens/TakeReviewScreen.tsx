import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import { HeaderAction } from '../components/Bits';
import GradientButton from '../components/GradientButton';
import OutlineButton from '../components/OutlineButton';
import { useTheme } from '../ThemeContext';
import { Storage, SelfTapes, ApiError } from '../api';
import { useToast } from '../components/Toast';
import { fonts, radii, palette, stageSurfaces } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'TakeReview'>;

// Review a recorded self-tape, then upload it:
// POST /storage/uploads/request-url → PUT the bytes → POST /projects/:id/selftapes.
export default function TakeReviewScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { id: projectId, uri, durationMs } = route.params;
  const player = useVideoPlayer(uri ? { uri } : null);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const mimeType = uri?.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
  const secs = Math.round((durationMs || 0) / 1000);
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  // Rewind to the first frame when the take ends, as the web's review player does.
  useEffect(() => {
    const sub = player.addListener('playToEnd', () => {
      setPlaying(false);
      player.currentTime = 0;
    });
    return () => sub.remove();
  }, [player]);

  const togglePlay = () => {
    if (playing) player.pause();
    else player.play();
    setPlaying(!playing);
  };

  const toast = useToast();

  // An unsaved take lives only on this device, so leaving or re-shooting asks.
  const guard = (where: 'exit' | 'new-take', go: () => void) => {
    if (saved) { go(); return; }
    Alert.alert("This take isn't saved yet", `It's only on this device. ${where === 'exit' ? 'Leaving now' : 'Recording another take'} will discard it.`, [
      { text: 'Discard it', style: 'destructive', onPress: go },
      { text: 'Go back', style: 'cancel' },
      { text: 'Save it first', onPress: () => void save() },
    ]);
  };
  const newTake = () => guard('new-take', () => navigation.replace('Studio', { id: projectId }));
  const exit = () => guard('exit', () => navigation.goBack());

  const save = async () => {
    if (!uri || saving || saved) return;
    if (!projectId) {
      Alert.alert('No script attached', 'Open the Studio from a script to save takes against it.');
      return;
    }
    setSaving(true);
    try {
      const info = await FileSystem.getInfoAsync(uri);
      const size = info.exists && 'size' in info ? info.size : 0;
      const name = uri.split('/').pop() || `take.${mimeType === 'video/quicktime' ? 'mov' : 'mp4'}`;
      const { uploadURL, objectPath } = await Storage.requestUploadUrl(name, size, mimeType);
      const res = await FileSystem.uploadAsync(uploadURL, uri, {
        httpMethod: 'PUT',
        uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
        headers: { 'Content-Type': mimeType },
      });
      if (res.status < 200 || res.status >= 300) {
        throw new Error(`Upload failed (${res.status})`);
      }
      await SelfTapes.create(projectId, {
        objectPath,
        mimeType,
        durationMs: durationMs || secs * 1000,
        watermarkBurnedIn: false,
      });
      setSaved(true);
      toast({ title: 'Take saved', description: "Saved to your account. It'll be here next time, on any device." });
    } catch (e) {
      const demo = e instanceof ApiError && e.status === 403;
      toast({
        title: demo ? "Saving isn't available on the demo account" : "Couldn't save this take",
        description: demo ? 'Sign up to keep your self-tapes.' : 'You can still export it. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const exportTape = async () => {
    if (!uri) return;
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(uri, { mimeType });
    } else {
      Alert.alert('Sharing unavailable', 'This device cannot share files.');
    }
  };

  return (
    <Screen>
      <View style={styles.header}>
        <HeaderAction icon="chevron-left" label="Back to script" color={theme.muted} onPress={exit} />
        <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: theme.text }}>Review take</Text>
        <View style={{ width: 60 }} />
      </View>

      <View style={[styles.preview, { borderColor: theme.border }]}>
        {uri ? (
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} />
        ) : null}
        <TouchableOpacity
          onPress={() => void togglePlay()}
          style={styles.playBtn}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={playing ? 'Pause' : 'Play'}
        >
          <Feather name={playing ? 'pause' : 'play'} size={22} color={palette.white} />
        </TouchableOpacity>
        <Text style={styles.duration}>{clock}</Text>
      </View>

      {/* Save state first, stated plainly — as on the web. */}
      <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: saved ? theme.success : theme.muted, textAlign: 'center', marginTop: 14 }}>
        {saved
          ? '✓ Saved to your account — available next time, on any device.'
          : saving
            ? 'Saving to your account…'
            : 'Not saved yet — this take is only on this device until you save it.'}
      </Text>

      <View style={{ flex: 1 }} />

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <OutlineButton label="↺ New take" flex onPress={newTake} />
        <OutlineButton secondary label="⬇ Export video" flex onPress={() => void exportTape()} />
      </View>
      {saving ? (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <ActivityIndicator color={theme.accent} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.muted, marginTop: 8 }}>
            Saving…
          </Text>
        </View>
      ) : (
        <GradientButton label={saved ? '✓ Saved' : 'Save take'} disabled={saved} onPress={() => void save()} style={saved ? { opacity: 0.7 } : undefined} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  preview: {
    borderRadius: radii.card, borderWidth: 1, aspectRatio: 9 / 14, backgroundColor: stageSurfaces.bg,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  playBtn: { width: 60, height: 60, borderRadius: 30, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  duration: {
    position: 'absolute', bottom: 12, right: 14, fontFamily: fonts.semibold, fontSize: 13,
    color: 'rgba(255,255,255,0.9)', backgroundColor: 'rgba(0,0,0,0.4)', paddingHorizontal: 9, paddingVertical: 3,
    borderRadius: radii.sm,
  },
});
