import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Field from '../components/Field';
import GradientButton from '../components/GradientButton';
import GoogleMark from '../components/GoogleMark';
import { Logo } from '../components/Bits';
import Card from '../components/Card';
import { useToast } from '../components/Toast';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import { useSocialAuth } from '../lib/socialAuth';
import { ApiError } from '../api';
import { CognitoError } from '../lib/cognito';
import { fonts, radii, PRESS_OPACITY, controlPill } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'SignIn'>;

const UNCONFIGURED_MESSAGE =
  'Set EXPO_PUBLIC_COGNITO_DOMAIN and EXPO_PUBLIC_COGNITO_CLIENT_ID (see src/config.ts) to enable social sign-in through AWS Cognito.';

export default function SignInScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { signIn, signInWithCognito } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSocialToken = async (idToken: string) => {
    await signInWithCognito(idToken);
    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
  };
  const onSocialError = (e: Error) => {
    // 422 = the server refused to CREATE an account because no legal acceptance
    // came with it. Signing in an existing user never hits this, so it means
    // this is a first-time account — which belongs on Create Account, where the
    // terms are shown and accepted.
    if (e instanceof ApiError && e.status === 422) {
      setError('Looks like you\'re new here — create an account to review and accept the terms.');
      return;
    }
    setError(e.message);
  };

  const google = useSocialAuth('Google', onSocialToken, onSocialError);
  const apple = useSocialAuth('SignInWithApple', onSocialToken, onSocialError);
  const showSocial = __DEV__ || (google.available && (Platform.OS !== 'ios' || apple.available));

  const submit = async () => {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) {
      // Signed up but never redeemed the emailed code. AuthContext has already
      // re-armed the pending sign-up, so VerifyEmail can finish it — the
      // password it needs is in memory, not in the route params.
      if (e instanceof CognitoError && e.code === 'UserNotConfirmedException') {
        setBusy(false);
        toast({ title: 'Please verify your email first — check your inbox for the code.', variant: 'destructive' });
        navigation.navigate('VerifyEmail', {});
        return;
      }
      setError(e instanceof CognitoError && e.code === 'NotAuthorizedException' ? 'Invalid email or password' : e instanceof Error ? e.message : 'Invalid email or password');
    } finally {
      setBusy(false);
    }
  };

  // The web's /login layout: brand, heading, then one card — Google first,
  // "or", email + password — and the sign-up link under it.
  return (
    <Screen keyboardAvoiding>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 32 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={{ alignItems: 'center', marginBottom: 32 }}>
          <Logo size={22} />
          <Text style={[styles.h1, { color: theme.text }]}>Welcome back</Text>
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: theme.muted, marginTop: 4 }}>Sign in to continue your rehearsal</Text>
        </View>

        <Card padding={22} style={{ gap: 14 }}>
          {showSocial ? (
            <>
              <TouchableOpacity activeOpacity={PRESS_OPACITY}
                accessibilityRole="button"
                onPress={() => (google.available ? google.prompt() : setError(UNCONFIGURED_MESSAGE))}
                style={[styles.social, { borderColor: theme.border, backgroundColor: theme.surface }]}
              >
                {google.busy ? <ActivityIndicator size="small" color={theme.accent} /> : (
                  <>
                    <GoogleMark size={17} />
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 14.5, color: theme.text }}>Continue with Google</Text>
                  </>
                )}
              </TouchableOpacity>
              {Platform.OS === 'ios' ? (
                <TouchableOpacity activeOpacity={PRESS_OPACITY}
                  accessibilityRole="button"
                  onPress={() => (apple.available ? apple.prompt() : setError(UNCONFIGURED_MESSAGE))}
                  style={[styles.social, { backgroundColor: theme.key === 'stage' ? '#fff' : '#000', borderColor: 'transparent' }]}
                >
                  {apple.busy ? <ActivityIndicator size="small" color={theme.key === 'stage' ? '#000' : '#fff'} /> : (
                    <Text style={{ fontFamily: fonts.semibold, fontSize: 14.5, color: theme.key === 'stage' ? '#000' : '#fff' }}> Sign in with Apple</Text>
                  )}
                </TouchableOpacity>
              ) : null}
              <View style={styles.divider}>
                <View style={[styles.rule, { backgroundColor: theme.border }]} />
                <Text style={[styles.or, { color: theme.muted }]}>or</Text>
                <View style={[styles.rule, { backgroundColor: theme.border }]} />
              </View>
            </>
          ) : null}

          <Field label="Email" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
          <View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: -22, zIndex: 1 }}>
              <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={() => navigation.navigate('ResetPassword', { email })} accessibilityRole="link" hitSlop={8}>
                <Text style={{ fontFamily: fonts.medium, fontSize: 12, color: theme.muted }}>Forgot password?</Text>
              </TouchableOpacity>
            </View>
            <Field label="Password" value={password} onChangeText={setPassword} secure showToggle placeholder="••••••••" />
          </View>

          {error ? <Text style={[styles.error, { color: theme.destructive }]}>{error}</Text> : null}

          <GradientButton label={busy ? 'Signing in…' : 'Sign In'} disabled={busy} onPress={submit} />
        </Card>

        <View style={styles.switchRow}>
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: theme.muted }}>No account? </Text>
          <TouchableOpacity activeOpacity={PRESS_OPACITY} onPress={() => navigation.navigate('CreateAccount')} accessibilityRole="link">
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: theme.accent }}>Sign up</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 24, letterSpacing: -0.5, marginTop: 18 },
  error: { fontFamily: fonts.semibold, fontSize: 13, textAlign: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  rule: { flex: 1, height: 1 },
  or: { fontFamily: fonts.regular, fontSize: 12 },
  social: { ...controlPill, minHeight: 46, borderWidth: 1 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 20 },
});
