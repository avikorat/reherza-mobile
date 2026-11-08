import React, { useEffect, useRef, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, Pressable, Animated, Easing, AccessibilityInfo } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CommonActions, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import Onboarding from './Onboarding';
import { useTheme } from '../ThemeContext';
import { useAuth } from '../AuthContext';
import { Feedback } from '../api';
import { fonts } from '../theme';
import type { RootStackParamList } from '../types';

const initials = (name?: string) =>
  (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || 'U';

type Item = { icon: keyof typeof Feather.glyphMap; label: string; onPress: () => void; danger?: boolean };

// The web's AccountMenu: an initials chip that opens the account destinations.
// On a phone the dropdown becomes a bottom sheet — the platform's own pattern
// for a short list of actions — with the same items in the same order.
export default function AccountMenu() {
  const { theme } = useTheme();
  const { user, signOut } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const [feedbackOn, setFeedbackOn] = useState(true);
  const slide = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then((v) => { reduceMotion.current = v; }).catch(() => {});
  }, []);

  // Kill switch, as on the web: the item is hidden only when feedback is off.
  useEffect(() => {
    if (open) Feedback.eligibility().then((e) => setFeedbackOn(e.enabled !== false)).catch(() => {});
  }, [open]);

  useEffect(() => {
    if (open) {
      setMounted(true);
      slide.setValue(0);
      Animated.timing(slide, { toValue: 1, duration: reduceMotion.current ? 0 : 260, easing: Easing.out(Easing.exp), useNativeDriver: true }).start();
    } else if (mounted) {
      Animated.timing(slide, { toValue: 0, duration: reduceMotion.current ? 0 : 180, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(() => setMounted(false));
    }
  }, [open]);

  if (!user) return null;

  // Close first, then act, so the sheet never sits over the next screen.
  const go = (fn: () => void) => () => { setOpen(false); setTimeout(fn, reduceMotion.current ? 0 : 190); };
  const items: Array<Item | 'sep'> = [
    { icon: 'home', label: 'Dashboard', onPress: go(() => navigation.navigate('Main', { screen: 'Home' })) },
    { icon: 'clock', label: 'History', onPress: go(() => navigation.navigate('Main', { screen: 'History' })) },
    { icon: 'settings', label: 'Settings', onPress: go(() => navigation.navigate('Main', { screen: 'Settings' })) },
    { icon: 'credit-card', label: 'Billing', onPress: go(() => navigation.navigate('Billing')) },
    { icon: 'help-circle', label: 'How it works', onPress: go(() => setTutorial(true)) },
    ...(feedbackOn ? [{ icon: 'message-square' as const, label: 'Send feedback', onPress: go(() => navigation.navigate('Feedback', { source: 'manual' })) }] : []),
    'sep',
    {
      icon: 'log-out',
      label: 'Sign out',
      danger: true,
      onPress: go(async () => {
        await signOut();
        navigation.dispatch(CommonActions.reset({ index: 0, routes: [{ name: 'SignIn' }] }));
      }),
    },
  ];

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [420, 0] });

  return (
    <>
      <TouchableOpacity
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel="Account menu"
        hitSlop={6}
        style={styles.trigger}
      >
        <View style={[styles.chip, { backgroundColor: theme.accentBg }]}>
          <Text style={{ fontFamily: fonts.bold, fontSize: 13, color: theme.accent }}>{initials(user.name)}</Text>
        </View>
      </TouchableOpacity>

      <Modal visible={mounted} transparent animationType="none" onRequestClose={() => setOpen(false)} statusBarTranslucent>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: slide }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close account menu" />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: theme.surface, paddingBottom: insets.bottom + 8, transform: [{ translateY }] }]}
        >
          <View style={[styles.grabber, { backgroundColor: theme.borderStrong }]} />
          <View style={styles.header}>
            <View style={[styles.chip, styles.chipLarge, { backgroundColor: theme.accentBg }]}>
              <Text style={{ fontFamily: fonts.bold, fontSize: 16, color: theme.accent }}>{initials(user.name)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={{ fontFamily: fonts.bold, fontSize: 16, color: theme.text }}>{user.name}</Text>
              <Text numberOfLines={1} style={{ fontFamily: fonts.regular, fontSize: 13, color: theme.muted, marginTop: 1 }}>{user.email}</Text>
            </View>
          </View>
          <View style={[styles.sep, { backgroundColor: theme.divider }]} />
          {items.map((it, i) =>
            it === 'sep' ? (
              <View key={`sep-${i}`} style={[styles.sep, { backgroundColor: theme.divider }]} />
            ) : (
              <Pressable
                key={it.label}
                onPress={it.onPress}
                accessibilityRole="button"
                android_ripple={{ color: theme.accentBg }}
                style={({ pressed }) => [styles.row, pressed && { backgroundColor: theme.surfaceAlt }]}
              >
                <Feather name={it.icon} size={19} color={it.danger ? theme.destructive : theme.muted} />
                <Text style={{ flex: 1, fontFamily: fonts.semibold, fontSize: 15, color: it.danger ? theme.destructive : theme.text }}>{it.label}</Text>
                {!it.danger ? <Feather name="chevron-right" size={17} color={theme.borderStrong} /> : null}
              </Pressable>
            )
          )}
        </Animated.View>
      </Modal>

      <Onboarding open={tutorial} onClose={() => setTutorial(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chip: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  chipLarge: { width: 46, height: 46, borderRadius: 23 },
  backdrop: { backgroundColor: 'rgba(15,23,42,0.42)' },
  sheet: {
    position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 22, borderTopRightRadius: 22,
    paddingTop: 8, shadowColor: '#0F172A', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: -6 }, elevation: 16,
  },
  grabber: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 10, opacity: 0.6 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 22, paddingTop: 6, paddingBottom: 16 },
  sep: { height: StyleSheet.hairlineWidth, marginVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 52, paddingHorizontal: 22 },
});
