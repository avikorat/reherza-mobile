import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Video, ResizeMode } from 'expo-av';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import GradientButton from '../components/GradientButton';
import OutlineButton from '../components/OutlineButton';
import { useTheme } from '../ThemeContext';
import { Storage, SelfTapes, ApiError } from '../api';
import { fonts, radii, palette, stageSurfaces } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'TakeReview'>;

// Review a recorded self-tape, then upload it:
// POST /storage/uploads/request-url → PUT the bytes → POST /projects/:id/selftapes.
export default function TakeReviewScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { id: projectId, uri, durationMs } = route.params;
  const videoRef = useRef<Video | null>(null);
  const [playing, setPlaying] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const mimeType = uri?.toLowerCase().endsWith('.mov') ? 'video/quicktime' : 'video/mp4';
  const secs = Math.round((durationMs || 0) / 1000);
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

  const togglePlay = async () => {
    if (!videoRef.current) return;
    if (playing) {
      await videoRef.current.pauseAsync();
      setPlaying(false);
    } else {
      await videoRef.current.playAsync();
      setPlaying(true);
    }
  };

  const save = async () => {
    if (!uri || saving || saved) return;
    if (!projectId) {
      Alert.alert('No script attached', 'Open the Studio from a script to save takes against it.');
      return;
    }
    setSaving(true);
    try {
      const info = await FileSystem.getInfoAsync(uri, { size: true });
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
      Alert.alert('Take saved', 'Your self-tape is safely in your library.', [
        { text: 'Done', onPress: () => navigation.popToTop() },
      ]);
    } catch (e) {
      const msg = e instanceof ApiError || e instanceof Error ? e.message : 'Upload failed.';
      Alert.alert('Could not save take', msg);
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
        <TouchableOpacity onPress={() => navigation.replace('Studio', { id: projectId })}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: theme.muted }}>‹ Retake</Text>
        </TouchableOpacity>
        <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: theme.text }}>Review take</Text>
        <TouchableOpacity onPress={() => void save()} disabled={saving || saved}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: saved ? theme.success : theme.accent }}>
            {saved ? 'Saved ✓' : 'Save'}
          </Text>
        </TouchableOpacity>
      </View>

      <View style={[styles.preview, { borderColor: theme.border }]}>
        {uri ? (
          <Video
            ref={videoRef}
            source={{ uri }}
            style={StyleSheet.absoluteFill}
            resizeMode={ResizeMode.COVER}
            onPlaybackStatusUpdate={(s) => {
              if (s.isLoaded && s.didJustFinish) {
                setPlaying(false);
                videoRef.current?.setPositionAsync(0);
              }
            }}
          />
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

      <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted, textAlign: 'center', marginTop: 14 }}>
        Happy with it? Save it to your library or share it with your reps.
      </Text>

      <View style={{ flex: 1 }} />

      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        <OutlineButton icon="rotate-ccw" label="Retake" flex onPress={() => navigation.replace('Studio', { id: projectId })} />
        <OutlineButton secondary icon="share" label="Share" flex onPress={() => void exportTape()} />
      </View>
      {saving ? (
        <View style={{ paddingVertical: 16, alignItems: 'center' }}>
          <ActivityIndicator color={theme.accent} />
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.muted, marginTop: 8 }}>
            Uploading your take…
          </Text>
        </View>
      ) : (
        <GradientButton
          label={saved ? 'Saved to library ✓' : 'Save to Library'}
          onPress={saved ? () => navigation.popToTop() : () => void save()}
        />
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
