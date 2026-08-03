import React, { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { themes, type Theme, type ThemeMode } from './theme';

interface ThemeContextValue {
  theme: Theme;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: themes.paper,
  mode: 'paper',
  setMode: () => {},
  toggle: () => {},
});

export function ThemeProvider({
  children,
  initial = 'paper',
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
      toggle: () => setMode((m) => (m === 'paper' ? 'stage' : 'paper')),
    }),
    [mode]
  );
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
