import React from 'react';
import { View, Text, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../ThemeContext';
import { fonts, radii, palette } from '../theme';

type BadgeVariant = 'solid' | 'soft' | 'success' | 'outline' | 'premium' | 'destructive';

interface BadgeProps {
  label: string;
  variant?: BadgeVariant;
  color?: string;
  style?: StyleProp<ViewStyle>;
}

// The web's `Badge` — `rounded-md border px-2.5 py-0.5 text-xs font-semibold`.
// Each tinted variant pairs a fill at 10% with the READABLE step of that hue for
// the label, so the text clears 4.5:1 on its own tint. The fill and text values
// are not interchangeable.
export default function Badge({ label, variant = 'soft', color, style }: BadgeProps) {
  const { theme } = useTheme();

  let bg = 'transparent';
  let fg = theme.muted;
  let borderColor = 'transparent';

  if (variant === 'solid') {
    bg = theme.accent;
    fg = palette.white;
  } else if (variant === 'soft') {
    // `info` on the web: primary/10 fill, primary/25 border, primary text.
    bg = theme.accentBg;
    fg = theme.accent;
    borderColor = theme.accentRing;
  } else if (variant === 'success') {
    bg = theme.successBg;
    fg = theme.success;
    borderColor = theme.successBg;
  } else if (variant === 'premium') {
    bg = theme.warningBg;
    fg = theme.warning;
    borderColor = theme.warningBg;
  } else if (variant === 'destructive') {
    bg = 'transparent';
    fg = theme.destructive;
    borderColor = theme.destructive;
  } else if (variant === 'outline') {
    borderColor = theme.border;
    fg = theme.text;
  }

  return (
    <View style={[styles.badge, { backgroundColor: bg, borderColor }, style]}>
      <Text style={[styles.label, { color: color || fg }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radii.control,
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  label: { fontFamily: fonts.semibold, fontSize: 11, letterSpacing: 0.2 },
});
