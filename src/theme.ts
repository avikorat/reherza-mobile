// Reherza design system — mirrors the high-fidelity mobile mockups.
// Two themes: "paper" (warm light) and "stage" (theatrical dark).

// The signature brand gradient, used on every primary action.
export const brandGradient = ['#F5A623', '#E0561B', '#C21807', '#9B111E'] as const;
export const brandGradientLocations = [0, 0.42, 0.68, 1] as const;
// Consistent angle for the pill gradient (roughly 100deg).
export const gradientStart = { x: 0, y: 0 };
export const gradientEnd = { x: 1, y: 0.25 };

// Warm accent gradient (used on avatars, icon tiles, mic button).
export const warmGradient = ['#F5A623', '#9B111E'] as const;

export const radii = {
  field: 12,
  card: 16,
  cardSm: 14,
  pill: 999,
  tile: 14,
} as const;

export const fonts = {
  // Archivo — all UI/body/headings.
  regular: 'Archivo_400Regular',
  medium: 'Archivo_500Medium',
  semibold: 'Archivo_600SemiBold',
  bold: 'Archivo_700Bold',
  heavy: 'Archivo_800ExtraBold',
  // Playfair Display — theatrical stat numbers & spoken lines.
  serif: 'PlayfairDisplay_600SemiBold',
  serifBold: 'PlayfairDisplay_700Bold',
} as const;

export const RED_DOT = '#FF0000';

export type ThemeMode = 'paper' | 'stage';

export interface Theme {
  key: ThemeMode;
  bg: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  borderStrong: string;
  divider: string;
  text: string;
  muted: string;
  accent: string;
  accent2: string;
  success: string;
  successBg: string;
  accentBg: string;
  accentRing: string;
  tabBar: string;
  statusBarStyle: 'light' | 'dark';
  homeIndicator: string;
  notch: string;
  shadow: string;
}

const paper: Theme = {
  key: 'paper',
  bg: '#EFE9DD',
  surface: '#F9F7F0',
  surfaceAlt: '#F4F0E7',
  border: '#E6DFD6',
  borderStrong: '#DBD3C7',
  divider: '#EBE5DB',
  text: '#16110C',
  muted: '#72675A',
  accent: '#C21807',
  accent2: '#F05A19',
  success: '#1F8A5B',
  successBg: 'rgba(31,138,91,0.12)',
  accentBg: 'rgba(194,24,7,0.10)',
  accentRing: 'rgba(194,24,7,0.08)',
  tabBar: 'rgba(249,247,240,0.97)',
  statusBarStyle: 'dark',
  homeIndicator: 'rgba(22,17,12,0.85)',
  notch: '#080604',
  shadow: 'rgba(22,17,12,0.10)',
};

const stage: Theme = {
  key: 'stage',
  bg: '#0E0B09',
  surface: '#1B1613',
  surfaceAlt: '#161210',
  border: '#3A332C',
  borderStrong: '#3A332C',
  divider: '#2A231E',
  text: '#F1EADC',
  muted: '#AEA28F',
  accent: '#F05A19',
  accent2: '#F5A623',
  success: '#4ADE9A',
  successBg: 'rgba(52,199,131,0.16)',
  accentBg: 'rgba(240,90,25,0.16)',
  accentRing: 'rgba(240,90,25,0.20)',
  tabBar: 'rgba(20,16,13,0.94)',
  statusBarStyle: 'light',
  homeIndicator: 'rgba(241,234,220,0.55)',
  notch: '#000000',
  shadow: 'rgba(0,0,0,0.4)',
};

export const themes: Record<ThemeMode, Theme> = { paper, stage };
