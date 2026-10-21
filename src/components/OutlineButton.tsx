import React from 'react';
import { Text, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useTheme } from '../ThemeContext';
import { fonts, radii } from '../theme';

interface OutlineButtonProps {
  label: string;
  /** Leading Feather glyph, as the web pairs a lucide icon with each label. */
  icon?: keyof typeof Feather.glyphMap;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  /** Renders the destructive step (#DC2626) — sign out, delete, cancel. */
  danger?: boolean;
  /** The palette's "Secondary Action": a card-white pill outlined and lettered
   *  in the readable brand cyan. Use for the second-choice action beside a CTA. */
  secondary?: boolean;
  small?: boolean;
  flex?: boolean;
}

// The web's `outline` and `secondary` button variants. Card surface, 1px border,
// no fill — so the gradient CTA beside it stays the only thing shouting.
export default function OutlineButton({
  label,
  icon,
  onPress,
  style,
  danger,
  secondary,
  small,
  flex,
}: OutlineButtonProps) {
  const { theme } = useTheme();
  // `danger` letters the label in the destructive step but keeps the neutral
  // border: a red-outlined Sign out shouts as loudly as a Delete, and the web
  // reserves the filled `destructive` variant for the genuinely destructive one.
  const borderColor = secondary ? theme.accent2 : theme.border;
  const color = secondary ? theme.accent2 : danger ? theme.destructive : theme.text;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[
        styles.btn,
        {
          backgroundColor: theme.surface,
          borderColor,
          paddingVertical: small ? 13 : 15,
          shadowColor: theme.shadow,
        },
        flex && { flex: 1 },
        style,
      ]}
    >
      {icon ? <Feather name={icon} size={small ? 15 : 16} color={color} /> : null}
      <Text style={[styles.label, { color, fontSize: small ? 14 : 15 }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radii.pill,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 18,
    shadowOpacity: 0.6,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label: { fontFamily: fonts.semibold },
});
