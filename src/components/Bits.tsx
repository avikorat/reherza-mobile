import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import {
  fonts,
  radii,
  brandGradient,
  brandGradientLocations,
  gradientStart,
  gradientEnd,
  diagonalStart,
  diagonalEnd,
  palette,
  RED_DOT,
} from '../theme';

// The Reherza wordmark — the web's `.app-logo`: a red "rec" dot with a glow,
// then "Reherza" in Manrope bold at -0.01em. The dot is sized in proportion to
// the wordmark so the lockup scales as one unit. The dot stays RED while the
// rest of the UI is blue: it is a recording light, not a brand accent.
export function Logo({ size = 17, color }: { size?: number; color?: string }) {
  const { theme } = useTheme();
  const dot = size * 0.5;
  return (
    <View style={styles.logoRow}>
      <View
        style={{
          width: dot,
          height: dot,
          borderRadius: dot,
          backgroundColor: RED_DOT,
          shadowColor: RED_DOT,
          shadowOpacity: 0.7,
          shadowRadius: dot * 0.84,
          shadowOffset: { width: 0, height: 0 },
        }}
      />
      <Text
        style={{
          fontFamily: fonts.bold,
          fontSize: size + 4,
          letterSpacing: -0.4,
          color: color || theme.text,
        }}
      >
        Reherza
      </Text>
    </View>
  );
}

// Initials avatar on the brand's 135° blue→cyan sweep — a "small decorative
// highlight" in the palette guide's terms.
export function Avatar({ initials, size = 40 }: { initials: string; size?: number }) {
  return (
    <LinearGradient
      colors={brandGradient}
      locations={brandGradientLocations}
      start={diagonalStart}
      end={diagonalEnd}
      style={{ width: size, height: size, borderRadius: size, alignItems: 'center', justifyContent: 'center' }}
    >
      <Text style={{ color: palette.white, fontFamily: fonts.bold, fontSize: size * 0.38 }}>{initials}</Text>
    </LinearGradient>
  );
}

// Back control on stack screens. A plain card-surface square — the web's `ghost`
// icon button, which carries no brand colour.
export function BackButton({ onPress }: { onPress: () => void }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      style={[styles.back, { backgroundColor: theme.surface, borderColor: theme.border }]}
    >
      <Feather name="chevron-left" size={22} color={theme.text} />
    </TouchableOpacity>
  );
}

// Progress bar with the brand sweep as its fill — one of the few surfaces the
// palette guide reserves the gradient for.
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
    <View style={{ height, borderRadius: height / 2, backgroundColor: track || theme.surfaceAlt, overflow: 'hidden' }}>
      <LinearGradient
        colors={brandGradient}
        locations={brandGradientLocations}
        start={gradientStart}
        end={gradientEnd}
        style={{ width: `${clamped * 100}%`, height: '100%', borderRadius: height / 2 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  back: {
    width: 38, height: 38, borderRadius: radii.control, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
});
