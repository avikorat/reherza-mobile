import React from 'react';
import { Text, StyleSheet, TouchableOpacity, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  brandGradient,
  brandGradientLocations,
  gradientStart,
  gradientEnd,
  fonts,
  radii,
  palette,
} from '../theme';

interface GradientButtonProps {
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  small?: boolean;
  disabled?: boolean;
}

// The primary action, everywhere. This is the web's `.btn-brand` — the blue→cyan
// sweep, 700 weight, 0.02em tracking — on the Dashboard's `rounded-full` pill.
// It is the only place the brand gradient appears on a control.
export default function GradientButton({
  label,
  onPress,
  style,
  textStyle,
  small,
  disabled,
}: GradientButtonProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={[styles.wrap, disabled && styles.disabled, style]}
    >
      <LinearGradient
        colors={brandGradient}
        locations={brandGradientLocations}
        start={gradientStart}
        end={gradientEnd}
        style={[styles.grad, { paddingVertical: small ? 13 : 16 }]}
      >
        <Text style={[styles.label, small && styles.labelSmall, textStyle]}>{label}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radii.pill,
    // `0 6px 16px hsl(primary / 0.28)` — the web's hover elevation, which on
    // touch reads better as the button's resting state.
    shadowColor: palette.blue,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  disabled: { opacity: 0.5, shadowOpacity: 0, elevation: 0 },
  grad: {
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  label: { color: palette.white, fontFamily: fonts.bold, fontSize: 16, letterSpacing: 0.3 },
  labelSmall: { fontSize: 14 },
});
