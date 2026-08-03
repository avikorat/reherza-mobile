import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Field from '../components/Field';
import GradientButton from '../components/GradientButton';
import { Logo } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import { useSocialAuth } from '../lib/socialAuth';
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
  const onSocialError = (e: Error) => setError(e.message);

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
      setError(e instanceof Error ? e.message : 'Sign-in failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginTop: 24 }}>
        <Logo size={21} />
      </View>

      <Text style={[styles.h1, { color: theme.text }]}>Welcome{'\n'}back.</Text>
      <Text style={[styles.sub, { color: theme.muted }]}>
        Your scene partner is warmed up and waiting in the wings.
      </Text>

      <Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" style={{ marginBottom: 16 }} />
      <Field label="PASSWORD" value={password} onChangeText={setPassword} secure showToggle placeholder="Your password" />

      <TouchableOpacity onPress={() => navigation.navigate('ResetPassword')} style={{ alignSelf: 'flex-end', marginTop: 9, marginBottom: 10 }}>
        <Text style={[styles.link, { color: theme.accent }]}>Forgot password?</Text>
      </TouchableOpacity>

      {error ? (
        <Text style={[styles.error, { color: theme.accent }]}>{error}</Text>
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
        style={[styles.social, { borderColor: theme.borderStrong, backgroundColor: theme.surface }]}
      >
        {google.busy ? (
          <ActivityIndicator size="small" color={theme.accent} />
        ) : (
          <>
            <Text style={{ fontFamily: fonts.heavy, fontSize: 16, color: '#4285F4' }}>G</Text>
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

      <View style={{ flex: 1 }} />

      <View style={{ alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
        <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: theme.muted }}>New to Reherza? </Text>
        <TouchableOpacity onPress={() => navigation.navigate('CreateAccount')}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.accent }}>Create account</Text>
        </TouchableOpacity>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 34, letterSpacing: -1.1, lineHeight: 35, marginTop: 40, marginBottom: 8 },
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
});
