import React from 'react';
import { Text, StyleSheet, TouchableOpacity, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../ThemeContext';
import { fonts, radii } from '../theme';

interface OutlineButtonProps {
  label: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  danger?: boolean;
  small?: boolean;
  flex?: boolean;
}

// Secondary outline pill. Pass `danger` to tint text with the accent color.
export default function OutlineButton({ label, onPress, style, danger, small, flex }: OutlineButtonProps) {
  const { theme } = useTheme();
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
          borderColor: theme.borderStrong,
          paddingVertical: small ? 13 : 15,
        },
        flex && { flex: 1 },
        style,
      ]}
    >
      <Text style={[styles.label, { color: danger ? theme.accent : theme.text, fontSize: small ? 14 : 15 }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  btn: {
    borderRadius: radii.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  label: { fontFamily: fonts.semibold },
});
