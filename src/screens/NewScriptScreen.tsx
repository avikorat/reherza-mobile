import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Field from '../components/Field';
import GradientButton from '../components/GradientButton';
import OutlineButton from '../components/OutlineButton';
import { BackButton } from '../components/Bits';
import { useToast } from '../components/Toast';
import { useTheme } from '../ThemeContext';
import { ApiError, Projects, Usage } from '../api';
import { creditsLabel } from '../lib/format';
import { fonts, radii, PRESS_OPACITY } from '../theme';
import type { RootStackParamList, UsageInfo } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'NewScript'>;

const DEMO_SCRIPT = `MAYA: I thought you weren't coming.
LEO: I almost didn't.
MAYA: Then why are you here?
LEO: Because I needed to say it before the lights go up.
MAYA: Say what?
LEO: That I remember every line except the one that matters.
MAYA: Then maybe stop rehearsing and just say it.`;

const ACCEPTED = ['.txt', '.text', '.pdf', '.docx'];
const pagesLabel = (pages: number | undefined) => (pages === undefined ? 'being measured' : `${pages} ${pages === 1 ? 'page' : 'pages'}`);

interface PickedFile { name: string; size: number; base64: string }
interface Preflight { requiredMilli: number; remainingMilli: number; allowed: boolean; pages?: number; reused?: boolean }

// The web's /scripts/new ("Add a Script"): price and size are measured as soon
// as a file is picked or text is pasted, and stated before the button.
export default function NewScriptScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [raw, setRaw] = useState('');
  const [file, setFile] = useState<PickedFile | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);
  const [limits, setLimits] = useState<{ maxPages: number; wordsPerPage?: number } | null>(null);
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [sizeError, setSizeError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const measureSeq = useRef(0);
  const activeJob = useRef<number | null>(null);
  const jobSeq = useRef(0);

  useEffect(() => {
    Usage.me().then(setUsage).catch(() => {});
    Projects.uploadLimits().then(setLimits).catch(() => {});
  }, []);

  const measure = async (body: Parameters<typeof Projects.preflight>[0]) => {
    const id = ++measureSeq.current;
    setPreflight(null);
    setSizeError(null);
    try {
      const r = await Projects.preflight(body);
      if (measureSeq.current === id) setPreflight(r);
    } catch (e) {
      const data = e instanceof ApiError ? (e.body as { error?: string; code?: string } | null) : null;
      if (measureSeq.current === id && data?.code === 'SCRIPT_TOO_LONG') setSizeError(data.error ?? 'This script is too large to import.');
    }
  };

  // Pasted text is measured after a pause in typing, as on the web (600 ms).
  useEffect(() => {
    const text = raw.trim();
    if (file || !text) { if (!file) setPreflight(null); return; }
    const t = setTimeout(() => void measure({ rawScript: text }), 600);
    return () => clearTimeout(t);
  }, [raw, file]);

  const milliPerCredit = 1000;
  const maxPages = limits?.maxPages;
  const wordsPerPage = limits?.wordsPerPage;
  const pastedWords = raw.trim() ? raw.trim().split(/\s+/).length : 0;
  const pastedPages = pastedWords > 0 && wordsPerPage ? Math.ceil(pastedWords / wordsPerPage) : 0;
  const pastedTooLong = !file && maxPages !== undefined && pastedPages > maxPages;
  const pastedTooLongMessage = `This script is about ${pastedPages} pages long. Scripts are limited to ${maxPages ?? 0} pages — please shorten it.`;
  const neededMilli = file ? preflight?.requiredMilli ?? 0 : preflight?.requiredMilli ?? (pastedPages > 0 ? pastedPages * milliPerCredit : 0);
  const neededPages = preflight?.pages ?? (file ? undefined : pastedPages || undefined);
  const remainingMilli = preflight?.remainingMilli ?? usage?.creditsRemainingMilli;
  const notEnough = remainingMilli !== undefined && neededMilli > 0 && neededMilli > remainingMilli;
  const alreadyOwned = !!preflight?.reused;
  const accountMilli = usage?.creditsRemainingMilli;
  const belowOneCredit = accountMilli !== undefined && accountMilli < milliPerCredit;
  const disabled = !usage || belowOneCredit;
  const canSubmit = !disabled && !notEnough && !sizeError && !pastedTooLong && !pending && (!!file || !!raw.trim());

  const pickFile = async () => {
    if (disabled) return;
    const res = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'text/plain', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      copyToCacheDirectory: true,
    });
    if (res.canceled || !res.assets?.length) return;
    const a = res.assets[0];
    if (!ACCEPTED.some((ext) => a.name.toLowerCase().endsWith(ext))) {
      toast({ title: 'Upload a PDF, DOCX, or TXT file', variant: 'destructive' });
      return;
    }
    const base64 = await FileSystem.readAsStringAsync(a.uri, { encoding: FileSystem.EncodingType.Base64 });
    if (!title) setTitle(a.name.replace(/\.[^.]+$/, ''));
    setFile({ name: a.name, size: a.size || Math.round((base64.length * 3) / 4), base64 });
    setRaw('');
    void measure({ filename: a.name, dataBase64: base64 });
  };

  const submit = async () => {
    if (sizeError || pastedTooLong) {
      toast({ title: 'This script is too large to import', description: sizeError ?? pastedTooLongMessage, variant: 'destructive' });
      return;
    }
    if (notEnough) {
      toast({
        title: 'Not enough credits for this script',
        description: `This script is ${pagesLabel(neededPages)} and needs ${creditsLabel(neededMilli)}, but you have ${creditsLabel(remainingMilli ?? 0)} left. Import a shorter excerpt.`,
        variant: 'destructive',
      });
      return;
    }
    if (belowOneCredit) {
      toast({ title: 'You don’t have enough AI credits to add a new script. Wait for your allowance to reset.', variant: 'destructive' });
      return;
    }
    if (!title.trim()) { toast({ title: 'Add a title first', variant: 'destructive' }); return; }
    if (!file && !raw.trim()) { toast({ title: 'Upload a file or paste your script text', variant: 'destructive' }); return; }

    const job = ++jobSeq.current;
    activeJob.current = job;
    setPending(true);
    try {
      const project = file
        ? await Projects.importFile(title.trim(), file.name, file.base64, file.name.toLowerCase().endsWith('.pdf'))
        : await Projects.importText(title.trim(), raw);
      // Cancelled while the request was in flight: undo it now that there is an id.
      if (activeJob.current !== job) { Projects.cancelParse(project.id).catch(() => {}); return; }
      if (project.reused) toast({ title: "You've already added this script — opening it.", description: 'No credits were used.' });
      else toast({ title: 'Script imported — parsing in the background.' });
      navigation.replace('ScriptDetail', { id: project.id });
    } catch (e) {
      if (activeJob.current !== job) return;
      toast({ title: (e instanceof Error && e.message) || "Couldn't import that script. Please try again.", variant: 'destructive' });
    } finally {
      if (activeJob.current === job) { activeJob.current = null; setPending(false); }
    }
  };

  const cancel = () => {
    if (!pending) { navigation.goBack(); return; }
    activeJob.current = null;
    toast({ title: 'Import cancelled.' });
    navigation.goBack();
  };

  const note = (text: string, tone: 'muted' | 'bad') => (
    <View style={[styles.note, tone === 'bad' ? { borderColor: theme.destructive, backgroundColor: theme.destructiveBg } : { borderColor: theme.border, backgroundColor: theme.surfaceAlt }]}>
      <Text style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 17, color: tone === 'bad' ? theme.destructive : theme.muted }}>{text}</Text>
    </View>
  );

  return (
    <Screen keyboardAvoiding padded={false}>
      <View style={styles.header}>
        <BackButton onPress={cancel} />
        <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: theme.text }}>New Script</Text>
      </View>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 16 }}>
        <View>
          <Text style={[styles.h1, { color: theme.text }]}>Add a Script</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 13.5, color: theme.muted, marginTop: 4 }}>Upload a file or paste your script — characters are detected automatically.</Text>
        </View>

        {belowOneCredit ? (
          <View style={[styles.banner, { borderColor: theme.destructive, backgroundColor: theme.destructiveBg }]}>
            <Text style={{ fontSize: 17 }}>🔒</Text>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 13.5, color: theme.text }}>You need at least {creditsLabel(milliPerCredit)} to add a script</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: theme.muted, marginTop: 2 }}>
                You have {creditsLabel(accountMilli ?? 0)} left, and a script costs {creditsLabel(milliPerCredit)} per page. You can still rehearse the scripts already on your dashboard.
              </Text>
            </View>
          </View>
        ) : null}

        <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. Opening Night, Act 2" />

        {file ? (
          <View style={[styles.fileCard, { borderColor: theme.border, backgroundColor: theme.surface }]}>
            <View style={[styles.fileIcon, { backgroundColor: theme.surfaceAlt }]}><Feather name="file-text" size={18} color={theme.muted} /></View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: theme.text }}>{file.name}</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted, marginTop: 2 }}>{(file.size / 1024).toFixed(0)} KB</Text>
            </View>
            <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={() => { measureSeq.current++; setFile(null); setPreflight(null); setSizeError(null); }} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: theme.muted }}>Remove</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={pickFile} disabled={disabled} accessibilityRole="button" style={[styles.drop, { borderColor: theme.borderStrong, opacity: disabled ? 0.6 : 1 }]}>
            <Feather name="upload-cloud" size={28} color={theme.muted} style={{ marginBottom: 10 }} />
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: theme.text }}>Tap to choose a file</Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted, marginTop: 3 }}>PDF, DOCX, or TXT{maxPages ? ` · up to ${maxPages} pages` : ''}</Text>
          </TouchableOpacity>
        )}

        {!file ? (
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: theme.muted }}>Or paste your script</Text>
              <TouchableOpacity activeOpacity={PRESS_OPACITY} disabled={disabled} onPress={() => { setRaw(DEMO_SCRIPT); if (!title) setTitle('Opening Night'); }} accessibilityRole="button" style={{ minHeight: 36, justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: theme.accent }}>Load example</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              editable={!disabled}
              value={raw}
              onChangeText={setRaw}
              multiline
              textAlignVertical="top"
              placeholder={"MAYA: I thought you weren't coming.\nLEO: I almost didn't.\nMAYA: Then why are you here?"}
              placeholderTextColor={theme.muted}
              accessibilityLabel="Script text"
              style={[styles.paste, { borderColor: theme.borderStrong, backgroundColor: theme.surface, color: theme.text }]}
            />
          </View>
        ) : null}

        {/* Size first, then price — only one of these can be true. */}
        {alreadyOwned
          ? note("You've already added this script. Importing will just open it — no credits will be used.", 'muted')
          : sizeError || pastedTooLong
            ? note(sizeError ?? pastedTooLongMessage, 'bad')
            : notEnough
              ? note(`This script is ${pagesLabel(neededPages)} and needs ${creditsLabel(neededMilli)}, but you have ${creditsLabel(remainingMilli ?? 0)} left. Import a shorter excerpt.`, 'bad')
              : neededMilli > 0
                ? note(`This script is ${pagesLabel(neededPages)} and will use ${creditsLabel(neededMilli)}.${remainingMilli !== undefined ? ` You have ${creditsLabel(remainingMilli)} left.` : ''}`, 'muted')
                : null}

        <View style={{ flexDirection: 'row', gap: 10 }}>
          <GradientButton label={pending ? 'Importing…' : 'Import Script'} disabled={!canSubmit} onPress={submit} style={{ flex: 1, opacity: canSubmit ? 1 : 0.6 }} />
          <OutlineButton label={pending ? 'Cancel import' : 'Cancel'} onPress={cancel} />
        </View>

        {/* Apple 5.1.2(i): say who the script goes to before it is sent. */}
        <Text style={{ fontFamily: fonts.regular, fontSize: 11.5, lineHeight: 17, color: theme.muted }}>
          Your script is sent to Reherza and processed by OpenAI to find its characters and lines, and its partner lines are voiced by ElevenLabs.{' '}
          <Text style={{ color: theme.accent, fontFamily: fonts.semibold }} onPress={() => navigation.navigate('Legal', { docId: 'privacy' })}>Privacy Policy</Text>
        </Text>

        <Card padding={18}>
          <Text style={[styles.eyebrow, { color: theme.muted }]}>EXPECTED FORMAT</Text>
          <View style={{ backgroundColor: theme.surfaceAlt, borderRadius: 10, padding: 12 }}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 12, lineHeight: 19, color: theme.text, opacity: 0.8 }}>
              {"MAYA: I thought you weren't coming.\nLEO: I almost didn't.\nMAYA: Then why are you here?\n(She turns away.)\nLEO: Because I needed to say it."}
            </Text>
          </View>
          <Text style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: theme.muted, marginTop: 10 }}>
            Character name in caps, colon, then the line. Stage directions in parentheses are kept as acting notes.
          </Text>
        </Card>

        <Card padding={18}>
          <Text style={[styles.eyebrow, { color: theme.muted }]}>FILE TYPES</Text>
          {[['PDF', 'Director notes and annotations included'], ['DOCX', 'Word documents'], ['TXT', 'Plain text']].map(([ext, n]) => (
            <View key={ext} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 }}>
              <Text style={[styles.ext, { backgroundColor: theme.surfaceAlt, color: theme.muted }]}>{ext}</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>{n}</Text>
            </View>
          ))}
        </Card>

        <Text style={{ fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: theme.muted }}>
          Parsing runs in the background. You can leave this screen — your script will appear on the dashboard when it's ready.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 8 },
  h1: { fontFamily: fonts.heavy, fontSize: 26, letterSpacing: -0.6 },
  banner: { flexDirection: 'row', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 12, padding: 14 },
  fileIcon: { width: 36, height: 36, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  drop: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 12, paddingVertical: 30, paddingHorizontal: 20, alignItems: 'center' },
  paste: { borderWidth: 1, borderRadius: radii.field, padding: 14, minHeight: 200, fontFamily: fonts.medium, fontSize: 13.5, lineHeight: 21 },
  note: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 0.9, marginBottom: 10 },
  ext: { fontFamily: fonts.bold, fontSize: 11, width: 44, textAlign: 'center', paddingVertical: 2, borderRadius: 4, overflow: 'hidden' },
});
