import React, { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Animated, Text, StyleSheet, AccessibilityInfo } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../ThemeContext';
import { fonts, radii, palette } from '../theme';

// The web's toast: a short, non-blocking confirmation. Use it where the web
// toasts; keep Alert for questions that need an answer.
interface ToastOptions {
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
}

const ToastContext = createContext<(t: ToastOptions) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<ToastOptions | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const toast = useCallback((t: ToastOptions) => {
    clearTimeout(timer.current);
    setCurrent(t);
    AccessibilityInfo.announceForAccessibility([t.title, t.description].filter(Boolean).join('. '));
    Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }).start();
    timer.current = setTimeout(() => {
      Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => setCurrent(null));
    }, 3200);
  }, [opacity]);

  const bad = current?.variant === 'destructive';
  return (
    <ToastContext.Provider value={toast}>
      {children}
      {current ? (
        <Animated.View
          pointerEvents="none"
          accessibilityLiveRegion="polite"
          style={[
            styles.toast,
            { top: insets.top + 8, opacity, backgroundColor: bad ? theme.destructive : theme.surface, borderColor: bad ? theme.destructive : theme.border, shadowColor: theme.shadow },
          ]}
        >
          <Text style={{ fontFamily: fonts.bold, fontSize: 13.5, color: bad ? palette.white : theme.text }}>{current.title}</Text>
          {current.description ? (
            <Text style={{ fontFamily: fonts.regular, fontSize: 12.5, marginTop: 2, color: bad ? palette.white : theme.muted }}>{current.description}</Text>
          ) : null}
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  toast: {
    position: 'absolute', left: 16, right: 16, borderRadius: radii.card, borderWidth: 1,
    paddingHorizontal: 16, paddingVertical: 12, shadowOpacity: 0.9, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
  },
});
