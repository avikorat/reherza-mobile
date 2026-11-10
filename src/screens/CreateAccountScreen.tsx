import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Platform, TextInput } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import Screen from '../components/Screen';
import Card from '../components/Card';
import Field from '../components/Field';
import GradientButton from '../components/GradientButton';
import GoogleMark from '../components/GoogleMark';
import { Logo } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import { ApiError, Auth, Waitlist } from '../api';
import { CognitoError } from '../lib/cognito';
import { useSocialAuth } from '../lib/socialAuth';
import { LEGAL_DOCUMENTS } from '../legal';
import { toE164 } from '../lib/format';
import { fonts, radii, palette, PRESS_OPACITY, controlPill } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateAccount'>;

// The web's friendlyError for Cognito sign-up refusals.
function friendly(e: unknown): string {
  if (e instanceof CognitoError) {
    if (e.code === 'InvalidPasswordException') {
      const raw = e.message;
      const needs: string[] = [];
      if (/not long enough|length|8 char/i.test(raw)) needs.push('at least 8 characters');
      if (/uppercase/i.test(raw)) needs.push('an uppercase letter');
      if (/lowercase/i.test(raw)) needs.push('a lowercase letter');
      if (/numeric|number|digit/i.test(raw)) needs.push('a number');
      if (/symbol|special/i.test(raw)) needs.push('a symbol');
      if (needs.length) return `Your password needs ${needs.length > 1 ? `${needs.slice(0, -1).join(', ')} and ${needs[needs.length - 1]}` : needs[0]}.`;
    }
    if (e.code === 'UsernameExistsException') return 'An account with this email already exists — try signing in instead.';
    if (e.code === 'InvalidParameterException' && /phone/i.test(e.message)) return 'Enter a valid phone number, including the country code.';
    if (e.code === 'LimitExceededException' || e.code === 'TooManyRequestsException') return 'Too many attempts. Please wait a moment and try again.';
  }
  return e instanceof Error ? e.message : 'Registration failed.';
}

// The web's /register.
export default function CreateAccountScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { signUp, signInWithCognito } = useAuth();
  const [form, setForm] = useState({ first: '', last: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Partial<Record<'first' | 'email' | 'phone' | 'password' | 'legal' | 'form', string>>>({});
  const [busy, setBusy] = useState(false);
  // Explicit, unticked-by-default consent; the server enforces it too.
  const [accepted, setAccepted] = useState(false);
  const [signupOpen, setSignupOpen] = useState<boolean | null>(null);
  const [waitlistEmail, setWaitlistEmail] = useState('');
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => {
    Auth.signupStatus().then((r) => setSignupOpen(r.open)).catch(() => setSignupOpen(true));
  }, []);

  const joinWaitlist = async () => {
    setJoining(true);
    try {
      await Waitlist.join(waitlistEmail.trim());
      setJoined(true);
    } catch (e) {
      setErrors({ form: e instanceof Error ? e.message : 'Could not join the waitlist.' });
    } finally {
      setJoining(false);
    }
  };

  // A first-time Google/Apple sign-in creates an account, so it needs the
  // same acceptance first.
  const requireAcceptance = (): boolean => {
    if (accepted) return true;
    setErrors({ legal: 'You must accept the agreements below to continue' });
    return false;
  };
  const onSocialToken = async (idToken: string) => {
    await signInWithCognito(idToken);
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };
  const onSocialError = (e: Error) => setErrors({ form: e.message });
  const google = useSocialAuth('Google', onSocialToken, onSocialError);
  const apple = useSocialAuth('SignInWithApple', onSocialToken, onSocialError);
  // Release builds hide social sign-in unless it is configured, and on iOS
  // Google is only offered alongside Sign in with Apple (App Store 4.8).
  const showSocial = __DEV__ || (google.available && (Platform.OS !== 'ios' || apple.available));

  const submit = async () => {
    const e: typeof errors = {};
    if (!form.first.trim()) e.first = 'First name is required';
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) e.email = 'Enter a valid email';
    const phone = form.phone.trim() ? toE164(form.phone) : null;
    if (!form.phone.trim()) e.phone = 'Phone number is required';
    else if (!phone) e.phone = 'Enter a valid phone number';
    if (form.password.length < 8) e.password = 'At least 8 characters';
    if (!accepted) e.legal = 'You must accept the agreements below to continue';
    setErrors(e);
    if (Object.keys(e).length) return;
    setBusy(true);
    try {
      const res = await signUp(form.first, form.last, form.email.trim().toLowerCase(), form.password, phone!);
      if (res.status === 'signedIn') navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      else navigation.navigate('VerifyEmail', { destination: res.destination ?? res.email });
    } catch (err) {
      if (err instanceof ApiError && (err.body as { code?: string } | null)?.code === 'signups_closed') {
        setSignupOpen(false);
      } else if (err instanceof ApiError && err.status === 422) {
        // The server's required versions are ahead of this build's registry.
        setErrors({ form: 'The terms have been updated. Please update Reherza to continue.' });
      } else {
        setErrors({ form: friendly(err) });
      }
    } finally {
      setBusy(false);
    }
  };

  const err = (k: keyof typeof errors) => (errors[k] ? <Text style={[styles.fieldError, { color: theme.destructive }]}>{errors[k]}</Text> : null);

  return (
    <Screen keyboardAvoiding>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingVertical: 24 }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View style={{ alignItems: 'center', marginBottom: 28 }}>
          <Logo size={22} />
          <Text style={[styles.h1, { color: theme.text }]}>Create your account</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: theme.muted, marginTop: 4 }}>Start rehearsing out loud</Text>
        </View>

        {signupOpen === false ? (
          <Card padding={22} style={{ gap: 14 }}>
            <View style={{ alignItems: 'center' }}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 15.5, color: theme.text }}>Signups are full right now</Text>
              <Text style={{ fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 20, color: theme.muted, textAlign: 'center', marginTop: 4 }}>
                We've hit our current capacity. Join the waitlist and we'll email you the moment a spot opens up.
              </Text>
            </View>
            {joined ? (
              <Text style={{ fontFamily: fonts.semibold, fontSize: 13.5, color: theme.success, textAlign: 'center' }}>You're on the list — we'll be in touch. ✨</Text>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TextInput
                  value={waitlistEmail}
                  onChangeText={setWaitlistEmail}
                  placeholder="you@example.com"
                  placeholderTextColor={theme.muted}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  accessibilityLabel="Email"
                  style={[styles.inline, { borderColor: theme.border, color: theme.text, backgroundColor: theme.surface }]}
                />
                <GradientButton small label={joining ? '…' : 'Join'} disabled={joining || !waitlistEmail.trim()} onPress={joinWaitlist} />
              </View>
            )}
            {err('form')}
          </Card>
        ) : (
          <Card padding={22} style={{ gap: 14 }}>
            {showSocial ? (
              <>
                <TouchableOpacity activeOpacity={PRESS_OPACITY}
                  accessibilityRole="button"
                  onPress={() => { if (requireAcceptance() && google.available) google.prompt(); }}
                  style={[styles.social, { borderColor: theme.border, backgroundColor: theme.surface }]}
                >
                  {google.busy ? <ActivityIndicator size="small" color={theme.accent} /> : (
                    <>
                      <GoogleMark size={17} />
                      <Text style={{ fontFamily: fonts.semibold, fontSize: 14.5, color: theme.text }}>Sign up with Google</Text>
                    </>
                  )}
                </TouchableOpacity>
                {Platform.OS === 'ios' ? (
                  <TouchableOpacity activeOpacity={PRESS_OPACITY}
                    accessibilityRole="button"
                    onPress={() => { if (requireAcceptance() && apple.available) apple.prompt(); }}
                    style={[styles.social, { backgroundColor: theme.key === 'stage' ? '#fff' : '#000', borderColor: 'transparent' }]}
                  >
                    {apple.busy ? <ActivityIndicator size="small" color={theme.key === 'stage' ? '#000' : '#fff'} /> : (
                      <Text style={{ fontFamily: fonts.semibold, fontSize: 14.5, color: theme.key === 'stage' ? '#000' : '#fff' }}> Sign up with Apple</Text>
                    )}
                  </TouchableOpacity>
                ) : null}
                <View style={styles.divider}>
                  <View style={[styles.rule, { backgroundColor: theme.border }]} />
                  <Text style={{ fontFamily: fonts.regular, fontSize: 12, color: theme.muted }}>or</Text>
                  <View style={[styles.rule, { backgroundColor: theme.border }]} />
                </View>
              </>
            ) : null}

            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}><Field label="First Name" value={form.first} onChangeText={set('first')} placeholder="Jane" />{err('first')}</View>
              <View style={{ flex: 1 }}><Field label="Last Name" value={form.last} onChangeText={set('last')} placeholder="Doe" /></View>
            </View>
            <View><Field label="Email" value={form.email} onChangeText={set('email')} placeholder="you@example.com" keyboardType="email-address" />{err('email')}</View>
            <View><Field label="Phone Number" value={form.phone} onChangeText={set('phone')} placeholder="Enter phone number" keyboardType="phone-pad" />{err('phone')}</View>
            <View><Field label="Password" value={form.password} onChangeText={set('password')} secure showToggle placeholder="At least 8 characters" />{err('password')}</View>

            <TouchableOpacity activeOpacity={PRESS_OPACITY}
              onPress={() => { setAccepted((a) => !a); setErrors((x) => ({ ...x, legal: undefined })); }}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accepted }}
              accessibilityLabel="I have read and agree to the Reherza agreements"
              style={styles.consentRow}
            >
              <View style={[styles.checkbox, accepted ? { backgroundColor: theme.accent, borderColor: theme.accent } : { borderColor: theme.borderStrong }]}>
                {accepted ? <Feather name="check" size={13} color={palette.white} /> : null}
              </View>
              <Text style={{ flex: 1, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18, color: theme.muted }}>
                I have read and agree to the{' '}
                {LEGAL_DOCUMENTS.map((d, i) => (
                  <Text key={d.id}>
                    {i > 0 ? (i === LEGAL_DOCUMENTS.length - 1 ? ', and ' : ', ') : ''}
                    <Text style={{ color: theme.accent, fontFamily: fonts.semibold }} onPress={() => navigation.navigate('Legal', { docId: d.id })}>{d.title}</Text>
                  </Text>
                ))}
                .
              </Text>
            </TouchableOpacity>
            {err('legal')}
            {err('form')}

            <GradientButton label={busy ? 'Creating account…' : 'Create Account'} disabled={busy} onPress={submit} />
          </Card>
        )}

        <View style={styles.switchRow}>
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: theme.muted }}>Already have an account? </Text>
          <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={() => navigation.navigate('SignIn')} accessibilityRole="link">
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: theme.accent }}>Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 24, letterSpacing: -0.5, marginTop: 18 },
  fieldError: { fontFamily: fonts.medium, fontSize: 12, marginTop: 4 },
  social: { ...controlPill, minHeight: 46, borderWidth: 1 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: 1 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: { width: 20, height: 20, borderRadius: radii.sm, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  inline: { flex: 1, borderWidth: 1, borderRadius: radii.field, paddingHorizontal: 12, minHeight: 44, fontFamily: fonts.regular, fontSize: 14 },
  switchRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 20 },
});
