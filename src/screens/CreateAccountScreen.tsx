import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Linking,
  Platform,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Field from '../components/Field';
import GradientButton from '../components/GradientButton';
import { BackButton } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import { ApiError } from '../api';
import { useSocialAuth } from '../lib/socialAuth';
import { TERMS_URL, PRIVACY_URL } from '../config';
import { fonts, radii } from '../theme';
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
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSocialToken = async (idToken: string) => {
    await signInWithCognito(idToken);
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };
  const onSocialError = (e: Error) => setError(e.message);

  const google = useSocialAuth('Google', onSocialToken, onSocialError);
  const apple = useSocialAuth('SignInWithApple', onSocialToken, onSocialError);

  const submit = async () => {
    const name = `${form.first.trim()} ${form.last.trim()}`.trim();
    if (!name || !form.email.trim() || form.password.length < 8) {
      setError('Fill in your name and email, and pick a password of 8+ characters.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signUp(name, form.email.trim(), form.password);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) {
      if (e instanceof ApiError && (e.body as { code?: string } | null)?.code === 'signups_closed') {
        Alert.alert('Signups are full', e.message);
      }
      setError(e instanceof Error ? e.message : 'Registration failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <BackButton onPress={() => navigation.goBack()} />
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
        <Text style={[styles.h1, { color: theme.text }]}>Join the company.</Text>
        <Text style={[styles.sub, { color: theme.muted }]}>Create your rehearsal studio in under a minute.</Text>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
          <Field label="FIRST" value={form.first} onChangeText={set('first')} placeholder="First name" style={{ flex: 1 }} />
          <Field label="LAST" value={form.last} onChangeText={set('last')} placeholder="Last name" style={{ flex: 1 }} />
        </View>

        <Field label="EMAIL" value={form.email} onChangeText={set('email')} placeholder="you@example.com" keyboardType="email-address" style={{ marginBottom: 14 }} />
        <Field label="PASSWORD" value={form.password} onChangeText={set('password')} secure showToggle placeholder="Choose a password (8+ chars)" style={{ marginBottom: 14 }} />

        {error ? <Text style={[styles.error, { color: theme.accent }]}>{error}</Text> : null}

        {busy ? (
          <View style={{ paddingVertical: 16, alignItems: 'center' }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <GradientButton label="Create Account" onPress={submit} />
        )}

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => (google.available ? google.prompt() : Alert.alert('Google sign-up', UNCONFIGURED_MESSAGE))}
          style={[styles.social, { borderColor: theme.borderStrong, backgroundColor: theme.surface }]}
        >
          {google.busy ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <>
              <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: '#4285F4' }}>G</Text>
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: theme.text }}>Sign up with Google</Text>
            </>
          )}
        </TouchableOpacity>

        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => (apple.available ? apple.prompt() : Alert.alert('Sign in with Apple', UNCONFIGURED_MESSAGE))}
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

        <Text style={[styles.terms, { color: theme.muted }]}>
          By continuing you agree to our{' '}
          <Text
            style={{ color: theme.accent, fontFamily: fonts.semibold }}
            onPress={() => Linking.openURL(TERMS_URL).catch(() => {})}
          >
            Terms
          </Text>{' '}
          &{' '}
          <Text
            style={{ color: theme.accent, fontFamily: fonts.semibold }}
            onPress={() => Linking.openURL(PRIVACY_URL).catch(() => {})}
          >
            Privacy
          </Text>
          .
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 30, letterSpacing: -0.9, lineHeight: 32, marginTop: 22, marginBottom: 6 },
  sub: { fontFamily: fonts.regular, fontSize: 15, marginBottom: 26 },
  error: { fontFamily: fonts.semibold, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  social: {
    flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: radii.pill, paddingVertical: 14, marginTop: 12, marginBottom: 12,
  },
  terms: { fontFamily: fonts.regular, fontSize: 12, textAlign: 'center', lineHeight: 18, marginTop: 10 },
});
