import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { fonts, warmGradient, RED_DOT } from '../theme';

// The Reherza wordmark: red dot + name.
export function Logo({ size = 17, color }: { size?: number; color?: string }) {
  const { theme } = useTheme();
  const dot = size * 0.64;
  return (
    <View style={styles.logoRow}>
      <View style={[styles.dotHalo, { padding: dot * 0.36 }]}>
        <View style={{ width: dot, height: dot, borderRadius: dot, backgroundColor: RED_DOT }} />
      </View>
      <Text style={{ fontFamily: fonts.heavy, fontSize: size + 4, letterSpacing: -0.5, color: color || theme.text }}>
        Reherza
      </Text>
    </View>
  );
}

// Gradient initials avatar.
export function Avatar({ initials, size = 40 }: { initials: string; size?: number }) {
  return (
    <LinearGradient
      colors={warmGradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ width: size, height: size, borderRadius: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: '#fff', fontFamily: fonts.heavy, fontSize: size * 0.38 }}>{initials}</Text>
    </LinearGradient>
  );
}

// Circular back button used on stack screens.
export function BackButton({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={[styles.back, { backgroundColor: theme.surface, borderColor: theme.borderStrong }]}
    >
      <Feather name="chevron-left" size={22} color={theme.text} />
    </TouchableOpacity>
  );
}

// Thin progress bar with a gradient fill.
export function ProgressBar({
  progress = 0.5,
  height = 9,
  track,
}: {
  progress?: number;
  height?: number;
  track?: string;
}) {
  const { theme } = useTheme();
  const clamped = Math.min(1, Math.max(0, progress));
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: track || theme.border, overflow: 'hidden' }}>
      <LinearGradient
        colors={['#F5A623', theme.accent]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ width: `${clamped * 100}%`, height: '100%', borderRadius: height / 2 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dotHalo: { borderRadius: 999, backgroundColor: 'rgba(255,0,0,0.14)' },
  back: {
    width: 38, height: 38, borderRadius: 12, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
