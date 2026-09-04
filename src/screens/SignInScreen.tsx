import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Field from '../components/Field';
import GradientButton from '../components/GradientButton';
import GoogleMark from '../components/GoogleMark';
import { Logo } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import { useSocialAuth } from '../lib/socialAuth';
import { ApiError } from '../api';
import { CognitoError } from '../lib/cognito';
import { fonts, radii } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'SignIn'>;

const UNCONFIGURED_MESSAGE =
  'Set EXPO_PUBLIC_COGNITO_DOMAIN and EXPO_PUBLIC_COGNITO_CLIENT_ID (see src/config.ts) to enable social sign-in through AWS Cognito.';

export default function SignInScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { signIn, signInWithCognito } = useAuth();
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
        navigation.navigate('VerifyEmail', {});
        return;
      }
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboardAvoiding>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={{ alignItems: 'center', marginTop: 24 }}>
          <Logo size={21} />
        </View>

        <Text style={[styles.h1, { color: theme.text }]}>Welcome{'\n'}back.</Text>
        <Text style={[styles.sub, { color: theme.muted }]}>
          Your scene partner is warmed up and waiting in the wings.
        </Text>

        <Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" style={{ marginBottom: 16 }} />
        <Field label="PASSWORD" value={password} onChangeText={setPassword} secure showToggle placeholder="Your password" />

        <TouchableOpacity onPress={() => navigation.navigate('ResetPassword', { email })} style={{ alignSelf: 'flex-end', marginTop: 9, marginBottom: 10 }}>
          <Text style={[styles.link, { color: theme.accent }]}>Forgot password?</Text>
        </TouchableOpacity>

        {error ? (
          <Text style={[styles.error, { color: theme.destructive }]}>{error}</Text>
        ) : (
          <View style={{ height: 12 }} />
        )}

        {busy ? (
          <View style={styles.busy}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <GradientButton label="Sign In" onPress={submit} />
        )}

        <View style={styles.divider}>
          <View style={[styles.rule, { backgroundColor: theme.borderStrong }]} />
          <Text style={[styles.or, { color: theme.muted }]}>or</Text>
          <View style={[styles.rule, { backgroundColor: theme.borderStrong }]} />
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => (google.available ? google.prompt() : Alert.alert('Google sign-in', UNCONFIGURED_MESSAGE))}
          style={[styles.social, { borderColor: theme.border, backgroundColor: theme.surface }]}
        >
          {google.busy ? (
            <ActivityIndicator size="small" color={theme.accent} />
          ) : (
            <>
              <GoogleMark size={17} />
              <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: theme.text }}>Continue with Google</Text>
            </>
          )}
        </TouchableOpacity>

        {Platform.OS === 'ios' ? (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => (apple.available ? apple.prompt() : Alert.alert('Sign in with Apple', UNCONFIGURED_MESSAGE))}
            style={[styles.social, { backgroundColor: theme.key === 'stage' ? '#fff' : '#000', borderColor: 'transparent', marginTop: 10 }]}
          >
            {apple.busy ? (
              <ActivityIndicator size="small" color={theme.key === 'stage' ? '#000' : '#fff'} />
            ) : (
              <>
                <Text style={{ fontSize: 17, color: theme.key === 'stage' ? '#000' : '#fff' }}></Text>
                <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: theme.key === 'stage' ? '#000' : '#fff' }}>
                  Sign in with Apple
                </Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        <View style={styles.switchRow}>
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: theme.muted }}>New to Reherza? </Text>
          <TouchableOpacity onPress={() => navigation.navigate('CreateAccount')}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.accent }}>Create account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 34, letterSpacing: -0.8, lineHeight: 38, marginTop: 40, marginBottom: 8 },
  sub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, marginBottom: 30 },
  link: { fontFamily: fonts.semibold, fontSize: 13 },
  error: { fontFamily: fonts.semibold, fontSize: 13, marginBottom: 12, textAlign: 'center' },
  busy: { paddingVertical: 16, alignItems: 'center' },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 18 },
  rule: { flex: 1, height: 1 },
  or: { fontFamily: fonts.regular, fontSize: 12 },
  social: {
    flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: radii.pill, paddingVertical: 15,
  },
  // Sits with the sign-in options rather than at the foot of the screen. The
  // gap is wider than the spacing inside the group above it, so it reads as a
  // separate step without needing a rule to say so.
  switchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 30, paddingBottom: 8,
  },
});
