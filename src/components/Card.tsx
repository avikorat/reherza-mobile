import React, { type ReactNode } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../ThemeContext';
import { radii } from '../theme';

interface CardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  padding?: number;
  selected?: boolean;
}

// Surface card with border + soft shadow. Matches the paper/stage panels.
export default function Card({ children, style, padding = 16, selected }: CardProps) {
  const { theme } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.surface,
          borderColor: selected ? theme.accent : theme.border,
          borderWidth: selected ? 1.5 : 1,
          padding,
          shadowColor: theme.shadow,
        },
        selected && {
          shadowColor: theme.accent,
          shadowOpacity: 0.08,
          shadowRadius: 6,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radii.card,
    shadowOpacity: 0.5,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
});
