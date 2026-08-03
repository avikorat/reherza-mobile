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
} from '../theme';

interface GradientButtonProps {
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  small?: boolean;
}

// The signature gradient pill — Reherza's primary action everywhere.
export default function GradientButton({ label, onPress, style, textStyle, small }: GradientButtonProps) {
  return (
    <TouchableOpacity
      activeOpacity={0.9}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[styles.wrap, style]}
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
    shadowColor: '#C21807',
    shadowOpacity: 0.45,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  grad: {
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  label: { color: '#fff', fontFamily: fonts.bold, fontSize: 16 },
  labelSmall: { fontSize: 14 },
});
