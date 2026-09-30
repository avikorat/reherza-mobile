import React, { type ReactNode } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../ThemeContext';
import { radii, shadows } from '../theme';

interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  selected?: boolean;
}

// The web's `Card`: `rounded-xl border bg-card shadow`. A white surface on the
// slate page, held by a 1px slate-200 border and a slate-tinted shadow — never
// a gradient, per the palette guide's warning against gradient wallpaper.
// `selected` swaps the border to brand blue and tints the fill at primary/10,
// matching how the web marks a chosen role or line.
export default function Card({ children, style, padding = 16, selected }: CardProps) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        shadows.card,
        {
          backgroundColor: selected ? theme.accentSurface : theme.surface,
          borderColor: selected ? theme.accent : theme.border,
          borderWidth: 1,
          padding,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radii.card },
});
