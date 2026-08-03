import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../ThemeContext';
import { fonts, radii } from '../theme';

type BadgeVariant = 'solid' | 'soft' | 'success' | 'outline';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

// Small rounded pill. Variants: solid (accent), soft (tinted bg), outline, success.
export default function Badge({ label, variant = 'soft', color, style }: BadgeProps) {
  const { theme } = useTheme();

  let bg = 'transparent';
  let fg = theme.muted;
  let borderColor = 'transparent';
  let borderWidth = 0;

  if (variant === 'solid') {
    bg = theme.accent;
    fg = '#fff';
  } else if (variant === 'soft') {
    bg = theme.accentBg;
    fg = theme.accent;
  } else if (variant === 'success') {
    bg = theme.successBg;
    fg = theme.success;
  } else if (variant === 'outline') {
    borderColor = theme.borderStrong;
    borderWidth = 1;
    fg = theme.muted;
  }

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor, borderWidth }, style]}>
      <Text style={[styles.label, { color: color || fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  label: { fontFamily: fonts.bold, fontSize: 10.5, letterSpacing: 0.3 },
});
