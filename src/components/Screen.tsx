import React, { type ReactNode } from 'react';
import { View, StyleSheet, KeyboardAvoidingView } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView, useSafeAreaInsets, type Edge } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';

interface ScreenProps {
  children: ReactNode;
  bg?: string;
  edges?: Edge[];
  padded?: boolean;
  /** Lift content clear of the on-screen keyboard. Set on any screen with a
   *  text field. Pair it with a ScrollView (`contentContainerStyle: {flexGrow: 1}`)
   *  so tall forms can still be reached once the keyboard has taken half the
   *  screen. */
  keyboardAvoiding?: boolean;
}

// Every screen's outer container: themed background, status bar, safe area.
//
// All four edges are claimed by default. `left`/`right` matter as much as
// `top`/`bottom` — in landscape the notch eats one side, and a rounded display
// clips the corners of anything flush to the edge.
//
// A screen inside the tab navigator should pass `edges={SCREEN_EDGES_TABS}`
// instead: the tab bar is absolutely positioned over the bottom inset and pads
// itself for the home indicator, so a screen that ALSO claims `bottom` reserves
// that space twice. Those screens clear the bar with `useBottomTabBarHeight()`
// on their scroll content instead — see HomeScreen.
export const SCREEN_EDGES_TABS: Edge[] = ['top', 'left', 'right'];

// Both platforms need the KeyboardAvoidingView. Android draws edge-to-edge on
// this Expo SDK, and edge-to-edge disables adjustResize: the window no longer
// shrinks for the keyboard, so without padding here the keyboard covered the
// lower fields of every form (Confirm Password on Reset Password). The body is
// padded up by the keyboard's height; the screen's ScrollView then scrolls the
// focused field into view.
const KEYBOARD_BEHAVIOR = 'padding' as const;

export default function Screen({
  children,
  bg,
  edges = ['top', 'bottom', 'left', 'right'],
  padded = true,
  keyboardAvoiding = false,
}: ScreenProps) {
  const { theme } = useTheme();
  const background = bg || theme.bg;
  const body = <View style={[styles.body, padded && styles.padded]}>{children}</View>;
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: background }]} edges={edges}>
      <StatusBar style={theme.statusBarStyle} />
      {keyboardAvoiding ? (
        <KeyboardAvoidingView style={styles.body} behavior={KEYBOARD_BEHAVIOR}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
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
