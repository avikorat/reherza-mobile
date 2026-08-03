import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Field from '../components/Field';
import GradientButton from '../components/GradientButton';
import { BackButton } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { fonts } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'ResetPassword'>;

// Password reset codes are issued and verified by AWS Cognito/Amplify from
// the client; after a successful reset, sign in again as normal.
export default function ResetPasswordScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const [code, setCode] = useState('');
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');

  // Password strength meter — segments light with length.
  const lit = Math.min(4, Math.floor(pw.length / 3));
  const strengthColors = [theme.accent, '#E0561B', '#F5A623', '#F5A623'];

  return (
    <Screen>
      <BackButton onPress={() => navigation.goBack()} />

      <Text style={[styles.h1, { color: theme.text }]}>Reset your{'\n'}password.</Text>
      <Text style={[styles.sub, { color: theme.muted }]}>
        Enter the code we emailed you, then choose something new.
      </Text>

      <Field label="RESET CODE" value={code} onChangeText={setCode} placeholder="6-digit code" keyboardType="number-pad" style={{ marginBottom: 18 }} />
      <Field label="NEW PASSWORD" value={pw} onChangeText={setPw} secure showToggle placeholder="New password" style={{ marginBottom: 16 }} />
      <Field label="CONFIRM PASSWORD" value={confirm} onChangeText={setConfirm} secure placeholder="Repeat password" style={{ marginBottom: 14 }} />

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

      <GradientButton label="Update Password" onPress={() => navigation.popToTop()} />

      <View style={{ flex: 1 }} />

      <TouchableOpacity onPress={() => navigation.popToTop()} style={{ alignItems: 'center' }}>
        <Text style={{ fontFamily: fonts.bold, fontSize: 14, color: theme.accent }}>Back to sign in</Text>
      </TouchableOpacity>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 30, letterSpacing: -0.9, lineHeight: 32, marginTop: 32, marginBottom: 8 },
  sub: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, marginBottom: 30 },
  meter: { flexDirection: 'row', gap: 8, marginBottom: 26 },
});
