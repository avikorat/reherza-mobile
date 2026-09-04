import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { CommonActions, useFocusEffect, type CompositeScreenProps } from '@react-navigation/native';
import { useBottomTabBarHeight, type BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import Screen, { SCREEN_EDGES_TABS } from '../components/Screen';
import Card from '../components/Card';
import Badge from '../components/Badge';
import OutlineButton from '../components/OutlineButton';
import { Avatar } from '../components/Bits';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import { Auth, Billing } from '../api';
import { LEGAL_DOCUMENTS } from '../legal';
import { fonts, palette } from '../theme';
import type { RootStackParamList, Subscription, TabParamList } from '../types';

type Props = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Profile'>,
  NativeStackScreenProps<RootStackParamList>
>;

interface RowProps {
  label: string;
  value?: string;
  onPress?: () => void;
  toggle?: boolean;
  toggleValue?: boolean;
  onToggle?: (value: boolean) => void;
  last?: boolean;
}

function Row({ label, value, onPress, toggle, toggleValue, onToggle, last }: RowProps) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      activeOpacity={toggle ? 1 : 0.7}
      onPress={onPress}
      style={[styles.row, !last && { borderBottomWidth: 1, borderBottomColor: theme.divider }]}
    >
      <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
      {toggle ? (
        <Switch
          value={toggleValue}
          onValueChange={onToggle}
          trackColor={{ true: theme.accent, false: theme.border }}
          thumbColor={palette.white}
        />
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {value ? <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted }}>{value}</Text> : null}
          <Feather name="chevron-right" size={18} color={theme.muted} />
        </View>
      )}
    </TouchableOpacity>
  );
}

const initialsOf = (name?: string): string =>
  (name || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

export default function ProfileScreen({ navigation }: Props) {
  const { theme, mode, toggle } = useTheme();
  // The tab bar floats over the screen, so scroll content has to end above
  // it. This is the bar's real height (content + the device's bottom inset),
  // so it can't drift from the navigator's own config.
  const tabBarHeight = useBottomTabBarHeight();
  const { user, signOut } = useAuth();
  const [notifications, setNotifications] = useState(true);
  const [sub, setSub] = useState<Subscription | null>(null);

  useFocusEffect(
    useCallback(() => {
      Billing.subscription().then(setSub).catch(() => setSub(null));
    }, [])
  );

  const doSignOut = async () => {
    await signOut();
    navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'SignIn' }] }));
  };

  // Apple requires in-app account deletion for apps with account creation.
  const deleteAccount = () => {
    Alert.alert(
      'Delete account',
      'This permanently deletes your account, scripts and sessions. This cannot be undone.',
      [
        { text: 'Cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await Auth.deleteAccount();
              await doSignOut();
            } catch (e) {
              Alert.alert('Could not delete account', e instanceof Error ? e.message : 'Unknown error');
            }
          },
        },
      ]
    );
  };

  const planLabel = sub
    ? `${(sub.planDetails?.name || sub.plan || 'PRO').toUpperCase()} · ${sub.status === 'active' ? 'ACTIVE' : (sub.status || '').toUpperCase()}`
    : 'FREE PLAN';

  return (
    <Screen padded={false} edges={SCREEN_EDGES_TABS}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: tabBarHeight + 24, gap: 18 }}
      >
        <Text style={[styles.h1, { color: theme.text }]}>Profile</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 15 }}>
          <Avatar initials={initialsOf(user?.name)} size={64} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: fonts.bold, fontSize: 19, letterSpacing: -0.3, color: theme.text }}>{user?.name || '—'}</Text>
            <Text style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted }}>{user?.email || ''}</Text>
            <Badge variant="soft" label={planLabel} style={{ marginTop: 6 }} />
          </View>
        </View>

        <Card padding={0}>
          <Row label="Change password" onPress={() => navigation.navigate('ResetPassword')} />
          <Row label="Subscription & credits" onPress={() => navigation.navigate('Billing')} last />
        </Card>

        <Card padding={0}>
          <Row label="Appearance" value={mode === 'light' ? 'Light' : 'Stage'} onPress={toggle} />
          <Row label="Notifications" toggle toggleValue={notifications} onToggle={setNotifications} last />
        </Card>

        {/* The documents accepted at signup stay readable afterwards — both
            stores expect them reachable from inside the app, not just the signup
            form. Listed individually: a settings row that opens a page of
            settings rows is a level of nesting that earns nothing. */}
        <Text style={[styles.groupLabel, { color: theme.muted }]}>LEGAL</Text>
        <Card padding={0} style={{ marginTop: -8 }}>
          {LEGAL_DOCUMENTS.map((d, i) => (
            <Row
              key={d.id}
              label={d.title}
              onPress={() => navigation.navigate('Legal', { docId: d.id })}
              last={i === LEGAL_DOCUMENTS.length - 1}
            />
          ))}
        </Card>

        <OutlineButton label="Sign out" danger onPress={doSignOut} />
        <TouchableOpacity onPress={deleteAccount} style={{ alignItems: 'center' }}>
          <Text style={{ fontFamily: fonts.semibold, fontSize: 12.5, color: theme.muted }}>Delete account</Text>
        </TouchableOpacity>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h1: { fontFamily: fonts.heavy, fontSize: 26, letterSpacing: -0.6, marginTop: 4 },
  groupLabel: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.9, marginTop: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 15 },
  rowLabel: { fontFamily: fonts.semibold, fontSize: 14.5 },
});
