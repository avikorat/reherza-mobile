import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import Screen from '../components/Screen';
import GradientButton from '../components/GradientButton';
import { BackButton } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { fonts, warmGradient, radii } from '../theme';
import { user } from '../data';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'VerifyEmail'>;

// Email verification codes are issued by AWS Cognito/Amplify. This screen is
// part of that flow; the password-based signup path skips it entirely.
export default function VerifyEmailScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [resendIn, setResendIn] = useState(24);
  const refs = useRef<Array<TextInput | null>>([]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const setDigit = (i: number, v: string) => {
    const d = v.replace(/[^0-9]/g, '').slice(-1);
    setCode((c) => c.map((x, idx) => (idx === i ? d : x)));
    if (d && i < 5) refs.current[i + 1]?.focus();
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
    <Screen>
      <BackButton onPress={() => navigation.goBack()} />

      <LinearGradient colors={warmGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.icon}>
        <Text style={{ fontSize: 30 }}>✉</Text>
      </LinearGradient>

      <Text style={[styles.h1, { color: theme.text }]}>Check your inbox.</Text>
      <Text style={[styles.sub, { color: theme.muted }]}>
        We sent a 6-digit code to{'\n'}
        <Text style={{ color: theme.text, fontFamily: fonts.semibold }}>{user.email}</Text>
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
                  borderColor: active ? theme.accent : theme.borderStrong,
                  borderWidth: active ? 1.5 : 1,
                  color: theme.text,
                },
              ]}
            />
          );
        })}
      </View>

      <GradientButton
        label="Verify Email"
        onPress={() => navigation.reset({ index: 0, routes: [{ name: 'Main' }] })}
      />

      <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 22 }}>
        <Text style={{ fontFamily: fonts.regular, fontSize: 14, color: theme.muted }}>Didn't get it? </Text>
        {resendIn > 0 ? (
          <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.accent }}>
            Resend in 0:{String(resendIn).padStart(2, '0')}
          </Text>
        ) : (
          <TouchableOpacity onPress={() => setResendIn(24)}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.accent }}>Resend code</Text>
          </TouchableOpacity>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  icon: {
    width: 66, height: 66, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
    marginTop: 44, marginBottom: 26,
  },
  h1: { fontFamily: fonts.heavy, fontSize: 30, letterSpacing: -0.9, lineHeight: 32, marginBottom: 8 },
  sub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, marginBottom: 34 },
  codeRow: { flexDirection: 'row', gap: 10, marginBottom: 30 },
  cell: {
    flex: 1, aspectRatio: 1, borderRadius: radii.cardSm, textAlign: 'center',
    fontFamily: fonts.serif, fontSize: 28,
  },
});
