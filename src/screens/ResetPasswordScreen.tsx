import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Field from '../components/Field';
import GradientButton from '../components/GradientButton';
import { BackButton } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { Cognito, canonicalEmail } from '../lib/cognito';
import { scoreFill } from '../lib/scoreColors';
import { fonts } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

// Cognito's two-step reset: ForgotPassword emails a code, ConfirmForgotPassword
// redeems it against a new password. Both are unauthenticated operations — see
// src/lib/cognito.ts.
//
// This only reaches accounts that exist in the Cognito pool. An account created
// by an older build of this app registered straight against the backend and has
// no Cognito user, so Cognito answers UserNotFoundException; the copy below says
// so plainly rather than pretending an email went out.
type Step = 'request' | 'confirm';

export default function ResetPasswordScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const [step, setStep] = useState<Step>('request');
  const [email, setEmail] = useState(route.params?.email ?? '');
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Password strength meter — segments light with length. Strength is a score,
  // so it runs the score ramp (rose → amber → lime → green) rather than the
  // brand blue, which would read as "interactive". See src/lib/scoreColors.ts.
  const lit = Math.min(4, Math.floor(pw.length / 3));
  const strengthColors = [scoreFill(0), scoreFill(50), scoreFill(70), scoreFill(85)];

  const requestCode = async () => {
    if (!email.trim()) {
      setError('Enter the email address on your account.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { destination } = await Cognito.forgotPassword(canonicalEmail(email));
      setNotice(`We sent a code to ${destination || 'your email'}.`);
      setStep('confirm');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send a reset code.');
    } finally {
      setBusy(false);
    }
  };

  const submitNewPassword = async () => {
    if (code.trim().length < 6) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    if (pw.length < 8) {
      setError('Pick a password of at least 8 characters.');
      return;
    }
    if (pw !== confirm) {
      setError("Those passwords don't match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await Cognito.confirmForgotPassword(canonicalEmail(email), code.trim(), pw);
      // Straight back to Sign In with the address filled in — the new password
      // is not held anywhere, so signing in is a deliberate second step.
      navigation.navigate('SignIn');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not reset your password.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboardAvoiding>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 24 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <BackButton onPress={() => navigation.goBack()} />

        <Text style={[styles.h1, { color: theme.text }]}>Reset your{'\n'}password.</Text>
        <Text style={[styles.sub, { color: theme.muted }]}>
          {step === 'request'
            ? "Tell us your email and we'll send a reset code."
            : 'Enter the code we emailed you, then choose something new.'}
        </Text>

        {step === 'request' ? (
          <>
            <Field
              label="EMAIL"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              style={{ marginBottom: 18 }}
            />
            {error ? <Text style={[styles.error, { color: theme.destructive }]}>{error}</Text> : null}
            {busy ? (
              <View style={styles.busy}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : (
              <GradientButton label="Send reset code" onPress={() => void requestCode()} />
            )}
          </>
        ) : (
          <>
            {notice ? (
              <Text style={[styles.notice, { color: theme.success }]}>{notice}</Text>
            ) : null}

            <Field
              label="RESET CODE"
              value={code}
              onChangeText={setCode}
              placeholder="6-digit code"
              keyboardType="number-pad"
              style={{ marginBottom: 18 }}
            />
            <Field
              label="NEW PASSWORD"
              value={pw}
              onChangeText={setPw}
              secure
              showToggle
              placeholder="New password"
              style={{ marginBottom: 16 }}
            />
            <Field
              label="CONFIRM PASSWORD"
              value={confirm}
              onChangeText={setConfirm}
              secure
              placeholder="Repeat password"
              style={{ marginBottom: 14 }}
            />

            <View style={styles.meter}>
              {[0, 1, 2, 3].map((i) => (
                <View
                  key={i}
                  style={{
                    flex: 1,
                    height: 5,
                    borderRadius: 3,
                    backgroundColor: i < lit ? strengthColors[i] : theme.border,
                  }}
                />
              ))}
            </View>

            {error ? <Text style={[styles.error, { color: theme.destructive }]}>{error}</Text> : null}

            {busy ? (
              <View style={styles.busy}>
                <ActivityIndicator color={theme.accent} />
              </View>
            ) : (
              <GradientButton label="Update Password" onPress={() => void submitNewPassword()} />
            )}

            <TouchableOpacity
              onPress={() => void requestCode()}
              style={{ alignSelf: 'center', marginTop: 16 }}
            >
              <Text style={{ fontFamily: fonts.semibold, fontSize: 13, color: theme.accent }}>
                Send a new code
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 30, letterSpacing: -0.7, lineHeight: 34, marginTop: 32, marginBottom: 8 },
  sub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, marginBottom: 30 },
  meter: { flexDirection: 'row', gap: 8, marginBottom: 26 },
  error: { fontFamily: fonts.semibold, fontSize: 13, textAlign: 'center', marginBottom: 12 },
  notice: { fontFamily: fonts.semibold, fontSize: 13, textAlign: 'center', marginBottom: 18 },
  busy: { paddingVertical: 16, alignItems: 'center' },
});
