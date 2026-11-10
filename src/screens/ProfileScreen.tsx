import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Modal, TextInput } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CommonActions, useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import { useBottomTabBarHeight, type BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen, { SCREEN_EDGES_TABS } from '../components/Screen';
import Card from '../components/Card';
import Field from '../components/Field';
import GradientButton from '../components/GradientButton';
import OutlineButton from '../components/OutlineButton';
import Onboarding, { useOnboarding } from '../components/Onboarding';
import { useToast } from '../components/Toast';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import { Auth, Feedback } from '../api';
import { Cognito, CognitoError, cognitoConfigured } from '../lib/cognito';
import { LEGAL_DOCUMENTS } from '../legal';
import { fonts, radii, PRESS_OPACITY, controlPill } from '../theme';
import type { RootStackParamList, TabParamList } from '../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Settings'>,
  NativeStackScreenProps<RootStackParamList>
>;

const DELETE_WORD = 'DELETE';
const initials = (name?: string) =>
  (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || 'U';

function Row({ label, value, onPress, last }: { label: string; value?: string; onPress?: () => void; last?: boolean }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={onPress} accessibilityRole="button" style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: theme.divider }]}>
      <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {value ? <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted }}>{value}</Text> : null}
        <Feather name="chevron-right" size={18} color={theme.muted} />
      </View>
    </TouchableOpacity>
  );
}

// The web's /settings (Profile, Change password, Session, Delete account) plus
// the account menu's other entries, which on a phone live here.
export default function ProfileScreen({ navigation }: Props) {
  const { theme, mode, toggle } = useTheme();
  const tabBarHeight = useBottomTabBarHeight();
  const { user, signOut } = useAuth();
  const toast = useToast();
  const onboarding = useOnboarding();
  const [feedbackOn, setFeedbackOn] = useState(false);
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      Feedback.eligibility().then((e) => setFeedbackOn(e.enabled)).catch(() => setFeedbackOn(false));
    }, [])
  );

  const doSignOut = async () => {
    await signOut();
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'SignIn' }] }));
  };

  const changePassword = async () => {
    setPwError(null);
    if (!pw.current) return setPwError('Enter your current password');
    if (pw.next.length < 8) return setPwError('At least 8 characters');
    if (pw.next !== pw.confirm) return setPwError("Passwords don't match");
    if (pw.next === pw.current) return setPwError('New password must be different');
    setSaving(true);
    try {
      await Cognito.changePassword(user!.email, pw.current, pw.next);
      toast({ title: 'Password updated.' });
      setPw({ current: '', next: '', confirm: '' });
    } catch (e) {
      const code = e instanceof CognitoError ? e.code : '';
      toast({
        title: code === 'NotAuthorizedException' ? 'Your current password is incorrect.'
          : code === 'LimitExceededException' ? 'Too many attempts. Please try again later.'
            : e instanceof Error ? e.message : "Couldn't update your password.",
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Apple 5.1.1(v): account deletion in-app. Typed confirmation, as on the web.
  const deleteAccount = async () => {
    if (typed !== DELETE_WORD) return;
    setDeleting(true);
    try {
      await Auth.deleteAccount();
      toast({ title: 'Your account has been deleted.' });
      setDeleteOpen(false);
      await doSignOut();
    } catch (e) {
      toast({ title: e instanceof Error ? e.message : "Couldn't delete your account. Please try again.", variant: 'destructive' });
      setDeleting(false);
    }
  };

  return (
    <Screen padded={false} edges={SCREEN_EDGES_TABS} keyboardAvoiding>
      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: tabBarHeight + 24, gap: 16 }}
      >
        <Text style={[styles.h1, { color: theme.text }]}>Settings</Text>

        <Card padding={18}>
          <Text style={[styles.h2, { color: theme.text }]}>Profile</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {/* The web's tinted initials circle, matching the account menu. */}
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.accentBg, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 15, color: theme.accent }}>{initials(user?.name)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontFamily: fonts.semibold, fontSize: 14.5, color: theme.text }}>{user?.name}</Text>
              <Text numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 12.5, color: theme.muted }}>{user?.email}</Text>
            </View>
          </View>
        </Card>

        <Card padding={0}>
          <Row label="Billing" onPress={() => navigation.navigate('Billing')} />
          <Row label="How it works" onPress={onboarding.reopen} />
          {feedbackOn ? <Row label="Send feedback" onPress={() => navigation.navigate('Feedback', { source: 'manual' })} /> : null}
          <Row label="Contact support" onPress={() => navigation.navigate('Contact')} />
          <Row label="Appearance" value={mode === 'light' ? 'Light' : 'Stage'} onPress={toggle} last />
        </Card>

        {cognitoConfigured() ? (
          <Card padding={18}>
            <Text style={[styles.h2, { color: theme.text, marginBottom: 2 }]}>Change password</Text>
            <Text style={[styles.body, { color: theme.muted, marginBottom: 14 }]}>Use at least 8 characters. You'll stay signed in on this device.</Text>
            <View style={{ gap: 12 }}>
              <Field label="Current password" value={pw.current} onChangeText={(v) => setPw((p) => ({ ...p, current: v }))} secure placeholder="••••••••" />
              <Field label="New password" value={pw.next} onChangeText={(v) => setPw((p) => ({ ...p, next: v }))} secure placeholder="At least 8 characters" />
              <Field label="Confirm new password" value={pw.confirm} onChangeText={(v) => setPw((p) => ({ ...p, confirm: v }))} secure placeholder="Repeat new password" />
            </View>
            {pwError ? <Text style={{ fontFamily: fonts.semibold, fontSize: 12, color: theme.destructive, marginTop: 8 }}>{pwError}</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 14 }}>
              <GradientButton small label={saving ? 'Saving…' : 'Update password'} disabled={saving} onPress={changePassword} />
              <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={() => navigation.navigate('ResetPassword', { email: user?.email })} accessibilityRole="link" style={{ minHeight: 44, justifyContent: 'center' }}>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: theme.muted }}>Forgot your current password?</Text>
              </TouchableOpacity>
            </View>
          </Card>
        ) : null}

        {/* The documents accepted at signup stay readable afterwards — both
            stores expect them reachable from inside the app. */}
        <Text style={[styles.groupLabel, { color: theme.muted }]}>LEGAL</Text>
        <Card padding={0} style={{ marginTop: -8 }}>
          {LEGAL_DOCUMENTS.map((d, i) => (
            <Row key={d.id} label={d.title} onPress={() => navigation.navigate('Legal', { docId: d.id })} last={i === LEGAL_DOCUMENTS.length - 1} />
          ))}
        </Card>

        <Card padding={18}>
          <Text style={[styles.h2, { color: theme.text, marginBottom: 2 }]}>Session</Text>
          <Text style={[styles.body, { color: theme.muted, marginBottom: 14 }]}>Sign out of Reherza on this device.</Text>
          <OutlineButton small label="Sign out" onPress={doSignOut} style={{ alignSelf: 'flex-start' }} />
        </Card>

        <Card padding={18} style={{ borderColor: theme.destructive }}>
          <Text style={[styles.h2, { color: theme.destructive, marginBottom: 2 }]}>Delete account</Text>
          <Text style={[styles.body, { color: theme.muted, marginBottom: 14 }]}>
            Close your Reherza account. Your profile is anonymised and removed from active use, and you'll be signed out. This can't be undone from here.
          </Text>
          <OutlineButton small danger label="Delete account" onPress={() => { setTyped(''); setDeleteOpen(true); }} style={{ alignSelf: 'flex-start' }} />
        </Card>
      </ScrollView>

      <Modal visible={deleteOpen} transparent animationType="fade" onRequestClose={() => setDeleteOpen(false)}>
        <View style={styles.backdrop}>
          <View style={[styles.dialog, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <Text style={{ fontFamily: fonts.heavy, fontSize: 18, color: theme.text }}>Delete your account?</Text>
            <Text style={[styles.body, { color: theme.muted, marginTop: 6 }]}>
              This action is permanent and cannot be undone. Your profile is anonymised and you'll be signed out immediately. Type{' '}
              <Text style={{ fontFamily: fonts.bold, color: theme.text }}>{DELETE_WORD}</Text> below to confirm.
            </Text>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder={DELETE_WORD}
              placeholderTextColor={theme.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              accessibilityLabel="Type DELETE to confirm"
              style={[styles.confirmInput, { borderColor: theme.border, color: theme.text }]}
            />
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <OutlineButton small label="Cancel" onPress={() => setDeleteOpen(false)} />
              <TouchableOpacity activeOpacity={PRESS_OPACITY}
                onPress={() => void deleteAccount()}
                disabled={typed !== DELETE_WORD || deleting}
                accessibilityRole="button"
                style={[styles.dangerBtn, { backgroundColor: theme.destructive, opacity: typed !== DELETE_WORD || deleting ? 0.5 : 1 }]}
              >
                <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: '#fff' }}>{deleting ? 'Deleting…' : 'Delete Account'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Onboarding open={onboarding.open} onClose={onboarding.dismiss} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 26, letterSpacing: -0.6 },
  h2: { fontFamily: fonts.bold, fontSize: 15, marginBottom: 12 },
  body: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 19 },
  groupLabel: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.9, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 15 },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 14.5 },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  dialog: { width: '100%', maxWidth: 420, borderRadius: radii.card, borderWidth: 1, padding: 20 },
  confirmInput: { borderWidth: 1, borderRadius: radii.field, paddingHorizontal: 12, minHeight: 44, fontFamily: fonts.semibold, fontSize: 15, marginTop: 14 },
  dangerBtn: { ...controlPill },
});
