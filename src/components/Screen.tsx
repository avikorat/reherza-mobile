import React, { type ReactNode } from 'react';
import { View, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';

interface ScreenProps {
  children: ReactNode;
  bg?: string;
  edges?: Edge[];
  padded?: boolean;
}

// Full-screen themed container. Every screen wraps its content in this.
// `bg` overrides the theme background (used by the immersive Studio screen).
export default function Screen({ children, bg, edges = ['top', 'bottom'], padded = true }: ScreenProps) {
  const { theme } = useTheme();
  const background = bg || theme.bg;
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: background }]} edges={edges}>
      <StatusBar style={theme.statusBarStyle} />
      <View style={[styles.body, padded && styles.padded]}>{children}</View>
    </SafeAreaView>
  );
}

export function useInsets() {
  return useSafeAreaInsets();
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { flex: 1 },
  padded: { paddingHorizontal: 24 },
});
