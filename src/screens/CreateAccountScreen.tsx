import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Field from '../components/Field';
import GradientButton from '../components/GradientButton';
import GoogleMark from '../components/GoogleMark';
import { BackButton } from '../components/Bits';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import { ApiError, Auth, Waitlist } from '../api';
import { useSocialAuth } from '../lib/socialAuth';
import { LEGAL_DOCUMENTS } from '../legal';
import { fonts, radii, palette } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateAccount'>;

const UNCONFIGURED_MESSAGE =
  'Set EXPO_PUBLIC_COGNITO_DOMAIN and EXPO_PUBLIC_COGNITO_CLIENT_ID (see src/config.ts) to enable social sign-up through AWS Cognito.';

export default function CreateAccountScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { signUp, signInWithCognito } = useAuth();
  const [form, setForm] = useState({ first: '', last: '', email: '', password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Explicit affirmative consent, matching the web's signup checkbox. The
  // server enforces this independently (422 without a current set), but the
  // acceptance has to be a real action the user took, not an inference.
  const [accepted, setAccepted] = useState(false);
  // The operator can close signups; the screen then offers the waitlist.
  const [signupsOpen, setSignupsOpen] = useState(true);
  useEffect(() => {
    Auth.signupStatus().then((r) => setSignupsOpen(r.open)).catch(() => {});
  }, []);

  const joinWaitlist = async () => {
    const email = form.email.trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Enter your email above to join the waitlist.');
      return;
    }
    try {
      const r = await Waitlist.join(email);
      Alert.alert(r.alreadyJoined ? 'Already on the list' : "You're on the list", "We'll email you when a spot opens.");
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join the waitlist.');
    }
  };

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  // A first-time Google/Apple sign-in creates an account too, so it passes
  // through the same gate — the server checks at account creation, not at the
  // form. Blocking here gives a reason instead of a 422 from a button with no
  // visible terms attached to it.
  const requireAcceptance = (): boolean => {
    if (accepted) return true;
    setError('Please accept the terms below to continue.');
    return false;
  };

  const onSocialToken = async (idToken: string) => {
    await signInWithCognito(idToken);
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };
  const onSocialError = (e: Error) => setError(e.message);

  const google = useSocialAuth('Google', onSocialToken, onSocialError);
  const apple = useSocialAuth('SignInWithApple', onSocialToken, onSocialError);
  const showSocial = __DEV__ || (google.available && (Platform.OS !== 'ios' || apple.available));

  const submit = async () => {
    const name = `${form.first.trim()} ${form.last.trim()}`.trim();
    if (!name || !form.email.trim() || form.password.length < 8) {
      setError('Fill in your name and email, and pick a password of 8+ characters.');
      return;
    }
    if (!requireAcceptance()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await signUp(form.first, form.last, form.email, form.password);
      // A pool that auto-confirms signs the user straight in; the usual case
      // emails a code and hands off to VerifyEmail.
      if (res.status === 'signedIn') {
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      } else {
        navigation.navigate('VerifyEmail', { destination: res.destination });
      }
    } catch (e) {
      if (e instanceof ApiError && (e.body as { code?: string } | null)?.code === 'signups_closed') {
        setSignupsOpen(false);
        Alert.alert('Signups are full', e.message, [
          { text: 'Not now', style: 'cancel' },
          { text: 'Join waitlist', onPress: () => void joinWaitlist() },
        ]);
      } else if (e instanceof ApiError && e.status === 422) {
        // The server's required versions are ahead of this build's registry
        // (src/legal.ts). Nothing the user can fix by retrying.
        setError('The terms have been updated. Please update Reherza to continue.');
        setBusy(false);
        return;
      }
      setError(e instanceof Error ? e.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboardAvoiding>
      <BackButton onPress={() => navigation.goBack()} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={[styles.h1, { color: theme.text }]}>Join the company.</Text>
        <Text style={[styles.sub, { color: theme.muted }]}>Create your rehearsal studio in under a minute.</Text>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
          <Field label="FIRST" value={form.first} onChangeText={set('first')} placeholder="First name" style={{ flex: 1 }} />
          <Field label="LAST" value={form.last} onChangeText={set('last')} placeholder="Last name" style={{ flex: 1 }} />
        </View>

        <Field label="EMAIL" value={form.email} onChangeText={set('email')} placeholder="you@example.com" keyboardType="email-address" style={{ marginBottom: 14 }} />
        <Field label="PASSWORD" value={form.password} onChangeText={set('password')} secure showToggle placeholder="Choose a password (8+ chars)" style={{ marginBottom: 14 }} />

        {error ? <Text style={[styles.error, { color: theme.destructive }]}>{error}</Text> : null}

        {!signupsOpen ? (
          <View style={{ marginBottom: 14 }}>
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, color: theme.muted, marginBottom: 10 }}>
              New accounts are paused right now. Leave your email and we'll let you know when a spot opens.
            </Text>
            <GradientButton label="Join the waitlist" onPress={joinWaitlist} />
          </View>
        ) : null}

        {busy ? (
          <View style={{ paddingVertical: 16, alignItems: 'center' }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : signupsOpen ? (
          <GradientButton label="Create Account" onPress={submit} />
        ) : null}

        {/* Release builds hide social sign-in unless it is configured, and on
            iOS Google is only offered alongside Sign in with Apple (App Store 4.8). */}
        {showSocial ? (
          <>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => {
              if (!requireAcceptance()) return;
              google.available
                ? google.prompt()
                : Alert.alert('Google sign-up', UNCONFIGURED_MESSAGE);
            }}
            style={[styles.social, { borderColor: theme.border, backgroundColor: theme.surface }]}
          >
            {google.busy ? (
              <ActivityIndicator size="small" color={theme.accent} />
            ) : (
              <>
                <GoogleMark size={17} />
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: theme.text }}>Sign up with Google</Text>
              </>
            )}
          </TouchableOpacity>

          {Platform.OS === 'ios' ? (
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
              if (!requireAcceptance()) return;
              apple.available
                ? apple.prompt()
                : Alert.alert('Sign in with Apple', UNCONFIGURED_MESSAGE);
            }}
              style={[styles.social, { backgroundColor: theme.key === 'stage' ? '#fff' : '#000', borderColor: 'transparent', marginTop: 0, marginBottom: 22 }]}
            >
              {apple.busy ? (
                <ActivityIndicator size="small" color={theme.key === 'stage' ? '#000' : '#fff'} />
              ) : (
                <>
                  <Text style={{ fontSize: 17, color: theme.key === 'stage' ? '#000' : '#fff' }}></Text>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: theme.key === 'stage' ? '#000' : '#fff' }}>
                    Sign up with Apple
                  </Text>
                </>
              )}
            </TouchableOpacity>
          ) : null}
          </>
        ) : null}

        {/* The consent gate. Every document the server requires is named here
            and readable in-app before signing — no "by continuing" inference. */}
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => {
            setAccepted((a) => !a);
            setError(null);
          }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
          accessibilityLabel="I agree to the Reherza terms"
          style={styles.consentRow}
        >
          <View
            style={[
              styles.checkbox,
              accepted
                ? { backgroundColor: theme.accent, borderColor: theme.accent }
                : { borderColor: theme.borderStrong },
            ]}
          >
            {accepted ? <Feather name="check" size={13} color={palette.white} /> : null}
          </View>
          <Text style={[styles.terms, { color: theme.muted }]}>
            I agree to Reherza's{' '}
            {LEGAL_DOCUMENTS.map((d, i) => (
              <Text key={d.id}>
                <Text
                  style={{ color: theme.accent, fontFamily: fonts.semibold }}
                  onPress={() => navigation.navigate('Legal', { docId: d.id })}
                >
                  {d.title}
                </Text>
                {i < LEGAL_DOCUMENTS.length - 2 ? ', ' : i === LEGAL_DOCUMENTS.length - 2 ? ' and ' : '.'}
              </Text>
            ))}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 30, letterSpacing: -0.7, lineHeight: 34, marginTop: 22, marginBottom: 6 },
  sub: { fontFamily: fonts.regular, fontSize: 15, marginBottom: 26 },
  error: { fontFamily: fonts.semibold, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  social: {
    flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: radii.pill, paddingVertical: 14, marginTop: 12, marginBottom: 12,
  },
  terms: { flex: 1, fontFamily: fonts.regular, fontSize: 12, lineHeight: 18 },
  consentRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14 },
  checkbox: {
    width: 20, height: 20, borderRadius: radii.sm, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', marginTop: 1,
  },
});
