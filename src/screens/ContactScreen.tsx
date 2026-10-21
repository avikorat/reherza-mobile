import React, { useState } from 'react';
import { Text, StyleSheet, ScrollView, TextInput, Alert } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen from '../components/Screen';
import Field from '../components/Field';
import GradientButton from '../components/GradientButton';
import { BackButton } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import { Contact } from '../api';
import { fonts, radii } from '../theme';
import type { RootStackParamList } from '../types';

type Props = NativeStackScreenProps<RootStackParamList, 'Contact'>;

// In-app support contact — both stores want a way to reach the developer from
// inside the app, not only from the listing's support URL.
export default function ContactScreen({ navigation }: Props) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!name.trim() || !/^\S+@\S+\.\S+$/.test(email.trim()) || message.trim().length < 5) {
      Alert.alert('Almost there', 'Add your name, a valid email and a short message.');
      return;
    }
    setBusy(true);
    try {
      await Contact.send({ name: name.trim(), email: email.trim(), message: message.trim() });
      Alert.alert('Message sent', 'Thanks — we reply by email, usually within two business days.', [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch (e) {
      Alert.alert('Could not send', e instanceof Error ? e.message : 'Unknown error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen keyboardAvoiding>
      <BackButton onPress={() => navigation.goBack()} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingTop: 8, paddingBottom: 24, gap: 14 }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={[styles.h1, { color: theme.text }]}>Contact support</Text>
        <Field label="NAME" value={name} onChangeText={setName} placeholder="Your name" />
        <Field label="EMAIL" value={email} onChangeText={setEmail} placeholder="you@example.com" keyboardType="email-address" />
        <TextInput
          value={message}
          onChangeText={setMessage}
          multiline
          textAlignVertical="top"
          maxLength={5000}
          placeholder="How can we help?"
          placeholderTextColor={theme.muted}
          accessibilityLabel="Message"
          style={[styles.message, { borderColor: theme.borderStrong, backgroundColor: theme.surface, color: theme.text }]}
        />
        <GradientButton label={busy ? 'Sending…' : 'Send message'} disabled={busy} onPress={send} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 26, letterSpacing: -0.6 },
  message: { borderWidth: 1, borderRadius: radii.field, padding: 16, minHeight: 140, fontFamily: fonts.regular, fontSize: 14, lineHeight: 21 },
});
