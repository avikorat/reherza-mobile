// ════════════════════════════════════════════════════════════════════════════
// REHERZA MOBILE THEME — the single source of truth for colour in the app.
// ════════════════════════════════════════════════════════════════════════════
//
// This is a direct port of the web product's palette
// (Reherza/frontend/src/styles/theme.css). Every value below is one of the
// tokens defined there, so the two clients re-skin together: change a colour on
// the web, change the matching constant here.
//
// ── Rules inherited from the web palette ──────────────────────────────────
// 1. `accent` (brand blue) is the ONLY colour that ever means "interactive".
//    Nothing that is not tappable uses it, and no data encoding may use it.
// 2. There is exactly ONE gradient — the blue→cyan sweep below. It is reserved
//    for hero moments: the primary CTA, the plan hero, the active tab, the
//    progress fill, the mic button. Not on every card.
// 3. Status colours live outside the brand ramp so a failing state never reads
//    as "on brand". Each has a readable TEXT value and a separate FILL value;
//    they are not interchangeable (amber-500 as text is 2.15:1).
// 4. The "rec" dot in the logo is RED and is not part of the blue UI palette.
//    It reads as a recording light. It never means "error".

// ── PALETTE ────────────────────────────────────────────────────────────────
// Raw brand colours — the only "invented" values. Everything else aliases one.
const palette = {
  blue: '#2563EB',        // 5.17:1  brand primary
  blueHover: '#1D4ED8',
  blueActive: '#1E40AF',  //         pressed
  cyan: '#06B6D4',        // 2.45:1  fills only
  cyanText: '#0E7490',    // 5.37:1  readable cyan
  cyanBright: '#22D3EE',  //         for text OVER video
  amber: '#F59E0B',       // 2.15:1  fills only
  amberText: '#B45309',   // 5.05:1  readable amber
  green: '#22C55E',       // 2.32:1  fills only
  greenText: '#16A34A',   // 4.50:1
  lime: '#A3E635',        //         fills only
  limeText: '#4D7C0F',    // 5.6:1
  rose: '#F43F5E',        // 3.66:1  fills only
  red: '#DC2626',         // 4.83:1  destructive
  markRed: '#FF0000',     //         the logo "rec" dot

  // Neutral ramp (Tailwind slate).
  white: '#FFFFFF',
  slate50: '#F8FAFC',
  slate100: '#F1F5F9',
  slate200: '#E2E8F0',
  slate300: '#CBD5E1',
  slate400: '#94A3B8',
  slate500: '#64748B',    // 4.77:1 on white — the muted TEXT colour
  slate600: '#475569',    // 7.2:1
  slate700: '#334155',
  slate800: '#1E293B',
  slate900: '#0F172A',    // 16.8:1
} as const;

// ── The brand gradient ─────────────────────────────────────────────────────
// The web's `--gradient-brand`: a 90° blue→cyan sweep. THE only gradient in the
// product. Pair it with `diagonalStart`/`diagonalEnd` to get the 135° version
// (`--gradient-brand-diagonal`), which reads better across a large rectangle.
export const brandGradient = [palette.blue, palette.cyan] as const;
export const brandGradientLocations = [0, 1] as const;

// 90deg — bars, buttons, tabs.
export const gradientStart = { x: 0, y: 0 };
export const gradientEnd = { x: 1, y: 0 };

// 135deg — hero banners, stat cards, avatars, the mic button.
export const diagonalStart = { x: 0, y: 0 };
export const diagonalEnd = { x: 1, y: 1 };

// The dark "stage" surfaces used by immersive screens (Studio, Parsing) and by
// the marketing site's dark sections — `--rz-stage*` on the web.
export const stageSurfaces = {
  bg: palette.slate900,
  card: palette.slate800,
  border: palette.slate700,
  onDark: palette.slate50,
  onDarkMuted: palette.slate300,
  onDarkSubtle: palette.slate400,
} as const;

// ── Radii ──────────────────────────────────────────────────────────────────
// The web's `--radius: 0.625rem` (10px) and its derived steps.
export const radii = {
  sm: 6,        // --radius-sm
  control: 8,   // --radius-md — buttons, inputs, badges
  field: 8,
  tile: 10,     // --radius-lg
  cardSm: 12,
  card: 18,     // --radius-xl — Card, the default surface
  pill: 999,    // rounded-full — the Dashboard's primary CTAs
} as const;

// ── Type ───────────────────────────────────────────────────────────────────
// Manrope is the ONE project typeface, exactly as on the web: every heading,
// score and scripted line renders in Manrope, and WEIGHT carries the hierarchy.
// There is deliberately no display/serif face — the web dropped its second
// typeface for the same reason, and a `serif` slot here would only tempt one
// back in.
export const fonts = {
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
  heavy: 'Manrope_800ExtraBold',
} as const;

// ── Shadows ────────────────────────────────────────────────────────────────
// Slate-tinted to match the cool palette (`--shadow-card` on the web).
export const shadows = {
  card: {
    shadowColor: palette.slate900,
    shadowOpacity: 0.07,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
} as const;

// The Reherza mark. Deliberately red rather than the blue UI palette: it reads
// as a recording light, which is what the product does.
export const RED_DOT = palette.markRed;

export type ThemeMode = 'light' | 'stage';

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

  /** Brand blue — the only colour that means "interactive". */
  accent: string;
  /** Brand cyan, readable step. Secondary actions, the AI scene partner. */
  accent2: string;
  /** Brand cyan, fill step. Tints and decorative fills only — never text. */
  accent2Fill: string;
  accentBg: string;
  accentRing: string;
  /** `accentBg` pre-blended over `surface` — an OPAQUE tint for elevated
   *  cards. Android draws elevation shadows through translucent fills. */
  accentSurface: string;

  success: string;
  successBg: string;
  warning: string;
  warningFill: string;
  warningBg: string;
  destructive: string;

  /** 0-100 delivery scores. Monotonic and contains no blue. */
  scoreExcellent: string;
  scoreGood: string;
  scoreFair: string;
  scorePoor: string;

  /** Teleprompter line ownership — named by role, not hue. The actor has to
   *  tell their own line from the scene partner's at a glance, mid-take, so
   *  colour carries that and these are named by ROLE rather than by hue. */
  tpYou: string;
  tpPartner: string;
  tpPartnerBg: string;
  tpSpoken: string;

  tabBar: string;
  statusBarStyle: 'light' | 'dark';
  homeIndicator: string;
  notch: string;
  shadow: string;
}

// The product's default and only web theme: slate-50 page, white cards.
const light: Theme = {
  key: 'light',
  bg: palette.slate50,
  surface: palette.white,
  surfaceAlt: palette.slate100,
  border: palette.slate200,
  borderStrong: palette.slate300,
  divider: palette.slate200,
  text: palette.slate900,
  muted: palette.slate500,

  accent: palette.blue,
  accent2: palette.cyanText,
  accent2Fill: palette.cyan,
  accentBg: 'rgba(37,99,235,0.10)',   // primary/10
  accentRing: 'rgba(37,99,235,0.25)', // primary/25
  accentSurface: '#F2F6FE',           // primary/5 over white

  success: palette.greenText,
  successBg: 'rgba(34,197,94,0.10)',
  warning: palette.amberText,
  warningFill: palette.amber,
  warningBg: 'rgba(245,158,11,0.10)',
  destructive: palette.red,

  scoreExcellent: palette.greenText,
  scoreGood: palette.limeText,
  scoreFair: palette.amberText,
  scorePoor: palette.red,

  tpYou: palette.blue,
  tpPartner: palette.cyanText,
  tpPartnerBg: 'rgba(6,182,212,0.10)',
  tpSpoken: palette.green,

  tabBar: 'rgba(255,255,255,0.97)',
  statusBarStyle: 'dark',
  homeIndicator: 'rgba(15,23,42,0.85)',
  notch: palette.slate900,
  shadow: 'rgba(15,23,42,0.10)',
};

// The landing page's dark sections, carried into the app as a night theme.
// Text steps up the ramp (cyan-bright, lime) so it clears contrast on slate-900.
const stage: Theme = {
  key: 'stage',
  bg: stageSurfaces.bg,
  surface: stageSurfaces.card,
  surfaceAlt: '#172033',
  border: stageSurfaces.border,
  borderStrong: palette.slate600,
  divider: stageSurfaces.border,
  text: stageSurfaces.onDark,
  muted: stageSurfaces.onDarkSubtle,

  accent: '#60A5FA',                  // blue-400 — blue-600 is too dark on slate-900
  accent2: palette.cyanBright,
  accent2Fill: palette.cyan,
  accentBg: 'rgba(96,165,250,0.14)',
  accentRing: 'rgba(96,165,250,0.30)',
  accentSurface: '#243550',           // blue-400/14 over slate-800

  success: '#4ADE80',
  successBg: 'rgba(34,197,94,0.16)',
  warning: palette.amber,
  warningFill: palette.amber,
  warningBg: 'rgba(245,158,11,0.16)',
  destructive: '#F87171',

  scoreExcellent: '#4ADE80',
  scoreGood: palette.lime,
  scoreFair: palette.amber,
  scorePoor: palette.rose,

  tpYou: palette.white,               // --tp-you-on-video
  tpPartner: palette.cyanBright,      // --tp-partner-on-video
  tpPartnerBg: 'rgba(34,211,238,0.14)',
  tpSpoken: palette.green,

  tabBar: 'rgba(15,23,42,0.96)',
  statusBarStyle: 'light',
  homeIndicator: 'rgba(248,250,252,0.55)',
  notch: '#000000',
  shadow: 'rgba(0,0,0,0.5)',
};

export const themes: Record<ThemeMode, Theme> = { light, stage };

export { palette };
