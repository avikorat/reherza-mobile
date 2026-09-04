import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TextInput, TouchableOpacity, ActivityIndicator } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import Screen from '../components/Screen';
import GradientButton from '../components/GradientButton';
import { BackButton } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import {
  fonts,
  radii,
  brandGradient,
  brandGradientLocations,
  diagonalStart,
  diagonalEnd,
} from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'VerifyEmail'>;

// Confirms a Cognito sign-up with the emailed code, then signs the user in and
// exchanges the ID token for the app's own JWT (see AuthContext.confirmSignUp).
// Reached from Create Account, and from Sign In when an unconfirmed account
// tries to log in.
export default function VerifyEmailScreen({ navigation, route }: Props) {
  const { theme } = useTheme();
  const { confirmSignUp, resendSignUpCode, pendingEmail } = useAuth();
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [resendIn, setResendIn] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refs = useRef<Array<TextInput | null>>([]);

  // Cognito returns a masked destination ("a***@e***.com"); fall back to the
  // pending address so the screen always says where the code went.
  const destination = route.params?.destination || pendingEmail || 'your email';
  const full = code.join('');

  const submit = async () => {
    if (full.length < 6 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await confirmSignUp(full);
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not confirm that code.');
      setBusy(false);
    }
  };

  const resend = async () => {
    setError(null);
    try {
      await resendSignUpCode();
      setResendIn(30);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not resend the code.');
    }
  };

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/[^0-9]/g, '').slice(-1);
    setCode((c) => c.map((x, idx) => (idx === i ? d : x)));
    if (d && i < 5) refs.current[i + 1]?.focus();
    if (d && i === 5) refs.current[i]?.blur();
  };

  const onKeyPress =
    (i: number) =>
    ({ nativeEvent }: { nativeEvent: { key: string } }) => {
      if (nativeEvent.key === 'Backspace' && !code[i] && i > 0) {
        setCode((c) => c.map((x, idx) => (idx === i - 1 ? '' : x)));
        refs.current[i - 1]?.focus();
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

        <LinearGradient
          colors={brandGradient}
          locations={brandGradientLocations}
          start={diagonalStart}
          end={diagonalEnd}
          style={styles.icon}
        >
          <Text style={{ fontSize: 30 }}>✉</Text>
        </LinearGradient>

        <Text style={[styles.h1, { color: theme.text }]}>Check your inbox.</Text>
        <Text style={[styles.sub, { color: theme.muted }]}>
          We sent a 6-digit code to{'\n'}
          <Text style={{ color: theme.text, fontFamily: fonts.semibold }}>{destination}</Text>
        </Text>

        <View style={styles.codeRow}>
          {code.map((d, i) => {
            const active = Boolean(d);
            return (
              <TextInput
                key={i}
                ref={(r) => {
                  refs.current[i] = r;
                }}
                value={d}
                onChangeText={(v) => setDigit(i, v)}
                onKeyPress={onKeyPress(i)}
                keyboardType="number-pad"
                maxLength={1}
                style={[
                  styles.cell,
                  {
                    backgroundColor: theme.surface,
                    borderColor: active ? theme.accent : theme.border,
                    borderWidth: active ? 1.5 : 1,
                    color: theme.text,
                  },
                ]}
              />
            );
          })}
        </View>

        {error ? (
          <Text style={[styles.error, { color: theme.destructive }]}>{error}</Text>
        ) : null}

        {busy ? (
          <View style={{ paddingVertical: 16, alignItems: 'center' }}>
            <ActivityIndicator color={theme.accent} />
          </View>
        ) : (
          <GradientButton label="Verify Email" onPress={submit} disabled={full.length < 6} />
        )}

        <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 22 }}>
          <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: theme.muted }}>Didn't get it? </Text>
          {resendIn > 0 ? (
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.accent }}>
              Resend in 0:{String(resendIn).padStart(2, '0')}
            </Text>
          ) : (
            <TouchableOpacity onPress={() => void resend()}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.accent }}>Resend code</Text>
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 66, height: 66, borderRadius: radii.card, alignItems: 'center', justifyContent: 'center',
    marginTop: 44, marginBottom: 26,
  },
  h1: { fontFamily: fonts.heavy, fontSize: 30, letterSpacing: -0.7, lineHeight: 34, marginBottom: 8 },
  sub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, marginBottom: 34 },
  codeRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  error: { fontFamily: fonts.semibold, fontSize: 13, textAlign: 'center', marginBottom: 12 },
  cell: {
    flex: 1, aspectRatio: 1, borderRadius: radii.field, textAlign: 'center',
    fontFamily: fonts.semibold, fontSize: 28,
  },
});
