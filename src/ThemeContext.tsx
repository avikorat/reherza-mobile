import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { themes, type Theme, type ThemeMode } from './theme';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: themes.light,
  mode: 'light',
  setMode: () => {},
  toggle: () => {},
});

export function ThemeProvider({
  children,
  initial = 'light',
}: {
  children: ReactNode;
  initial?: ThemeMode;
}) {
  const [mode, setMode] = useState<ThemeMode>(initial);
  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      theme: themes[mode],
      setMode,
      toggle: () => setMode((m) => (m === 'light' ? 'stage' : 'light')),
    }),
    [mode]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
