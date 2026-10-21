import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Screen from '../components/Screen';
import Field from '../components/Field';
import GradientButton from '../components/GradientButton';
import { BackButton, HeaderAction } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { ApiError, Projects } from '../api';
import {
  fonts,
  radii,
  palette,
  brandGradient,
  brandGradientLocations,
  diagonalStart,
  diagonalEnd,
} from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'NewScript'>;

interface PickedFile {
  name: string;
  base64: string;
}

export default function NewScriptScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [title, setTitle] = useState('');
  const [pasted, setPasted] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [busy, setBusy] = useState(false);
  const [maxPages, setMaxPages] = useState<number | null>(null);

  useEffect(() => {
    Projects.uploadLimits().then((l) => setMaxPages(l.maxPages)).catch(() => {});
  }, []);

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.status === 402) {
      Alert.alert('Monthly limit reached', e.message, [
        { text: 'Not now' },
        { text: 'View usage', onPress: () => navigation.navigate('Billing') },
      ]);
    } else {
      Alert.alert('Import failed', e instanceof Error ? e.message : 'Unknown error');
    }
  };

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({
      type: [
        'application/pdf',
        'text/plain',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    const asset = res.assets[0];
    if (asset.size && asset.size > 15 * 1024 * 1024) {
      Alert.alert('File too large', 'Scripts can be up to 15 MB.');
      return;
    }
    const base64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    setFile({ name: asset.name, base64 });
    if (!title.trim()) setTitle(asset.name.replace(/\.[^.]+$/, ''));
  };

  const submit = async () => {
    const t = title.trim() || 'Untitled script';
    if (!file && pasted.trim().length < 10) {
      Alert.alert('Nothing to import', 'Upload a file or paste your script text first.');
      return;
    }
    setBusy(true);
    try {
      // The model-free price check. It refuses an oversized script with the
      // import's own message; anything else unexpected leaves the import to
      // be the gate.
      const price = await Projects.preflight(
        file ? { filename: file.name, dataBase64: file.base64 } : { rawScript: pasted.trim() }
      ).catch((e) => {
        if (e instanceof ApiError && (e.status === 400 || e.status === 413 || e.status === 422)) throw e;
        return null;
      });
      if (price && !price.allowed) {
        Alert.alert(
          'Not enough credits',
          `This script needs ${price.requiredMilli / 1000} credits${price.pages ? ` (${price.pages} pages)` : ''}; you have ${Math.floor(price.remainingMilli / 10) / 100}.`,
          [{ text: 'OK' }, { text: 'View usage', onPress: () => navigation.navigate('Billing') }]
        );
        return;
      }
      if (price && price.requiredMilli > 0) {
        const ok = await new Promise<boolean>((resolve) =>
          Alert.alert(
            'Import this script?',
            `It uses ${price.requiredMilli / 1000} credit${price.requiredMilli === 1000 ? '' : 's'}${price.pages ? ` (${price.pages} pages)` : ''}.`,
            [
              { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Import', onPress: () => resolve(true) },
            ],
            { cancelable: true, onDismiss: () => resolve(false) }
          )
        );
        if (!ok) return;
      }
      const project = file
        ? await Projects.importFile(t, file.name, file.base64)
        : await Projects.importText(t, pasted.trim());
      navigation.replace('Parsing', { id: project.id });
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboardAvoiding>
      <View style={styles.header}>
        <BackButton onPress={() => navigation.goBack()} />
        <Text style={[styles.headerTitle, { color: theme.text }]}>New Script</Text>
        <HeaderAction label="Cancel" color={theme.muted} onPress={() => navigation.goBack()} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Field label="SCRIPT TITLE" value={title} onChangeText={setTitle} placeholder="e.g. Opening Night, Act 2" style={{ marginBottom: 22 }} />

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={pickFile}
          style={[styles.dropzone, { borderColor: file ? theme.accent : theme.borderStrong, backgroundColor: theme.surface }]}
        >
          <LinearGradient
            colors={brandGradient}
            locations={brandGradientLocations}
            start={diagonalStart}
            end={diagonalEnd}
            style={styles.uploadIcon}
          >
            <Feather name={file ? 'check' : 'upload'} size={24} color={palette.white} />
          </LinearGradient>
          <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: theme.text, marginBottom: 4 }}>
            {file ? file.name : 'Upload your script'}
          </Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted }}>
            {file ? 'Tap to choose a different file' : `PDF, DOCX or TXT · up to ${maxPages ? `${maxPages} pages` : '15 MB'}`}
          </Text>
          {!file ? (
            <View style={[styles.browse, { borderColor: theme.accent }]}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 13.5, color: theme.accent }}>Browse files</Text>
            </View>
          ) : null}
        </TouchableOpacity>

        <View style={styles.divider}>
          <View style={[styles.rule, { backgroundColor: theme.borderStrong }]} />
          <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>or paste text</Text>
          <View style={[styles.rule, { backgroundColor: theme.borderStrong }]} />
        </View>

        <TextInput
          value={pasted}
          onChangeText={setPasted}
          multiline
          textAlignVertical="top"
          placeholder={"CAB DRIVER: Where to, friend? You look like a man in a hurry.\n\nOSWALD: North Beckley. And no — I've got all the time in the world…"}
          placeholderTextColor={theme.muted}
          style={[
            styles.paste,
            {
              borderColor: theme.borderStrong,
              backgroundColor: theme.surface,
              color: theme.text,
              fontFamily: fonts.regular,
              fontSize: 13.5,
              lineHeight: 22,
            },
          ]}
        />

        {busy ? (
          <View style={{ paddingVertical: 18, alignItems: 'center' }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <GradientButton label="Import & Parse" style={{ marginTop: 16 }} onPress={submit} />
        )}
        {/* Apple 5.1.2(i): say who the script goes to before it is sent. */}
        <Text style={{ fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 17, color: theme.muted, marginTop: 12, textAlign: 'center' }}>
          Your script is sent to Reherza and processed by OpenAI to find its characters and lines, and its partner lines are
          voiced by ElevenLabs.{' '}
          <Text style={{ color: theme.accent, fontFamily: fonts.semibold }} onPress={() => navigation.navigate('Legal', { docId: 'privacy' })}>
            Privacy Policy
          </Text>
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, marginBottom: 22 },
  headerTitle: { fontFamily: fonts.bold, fontSize: 16 },
  dropzone: {
    borderWidth: 2, borderStyle: 'dashed', borderRadius: radii.card,
    paddingVertical: 36, paddingHorizontal: 20, alignItems: 'center', marginBottom: 16,
  },
  uploadIcon: { width: 56, height: 56, borderRadius: radii.cardSm, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  browse: { marginTop: 16, paddingHorizontal: 22, paddingVertical: 10, borderRadius: radii.pill, borderWidth: 1 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 14 },
  rule: { flex: 1, height: 1 },
  paste: { borderWidth: 1, borderRadius: radii.field, padding: 16, minHeight: 120 },
});
