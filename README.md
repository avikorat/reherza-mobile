# Reherza — React Native (Expo) app

A production-ready React Native codebase for the Reherza iOS + Android app.
Built with Expo, React Navigation, and `expo-linear-gradient`.

The design system is a direct port of the web product's — every colour resolves
to a token that also exists in `Reherza/frontend/src/styles/theme.css`, so the
two clients re-skin together. See **Design system** below.

## Quick start

```bash
cd reherza-native
npm install          # or: yarn
EXPO_PUBLIC_API_URL=https://your-host.com/api npx expo start
```

### Pointing at your backend

The app talks to the Reherza backend (`src/api/`). Set the base URL (including
the `/api` prefix) via `EXPO_PUBLIC_API_URL`, or edit the default in
`src/config.js`. Notes:

- **Android emulator:** `localhost` is the emulator itself — use your Mac's
  LAN IP (e.g. `http://192.168.1.20:3000/api`) or `http://10.0.2.2:3000/api`.
- **Physical device (Expo Go):** use your machine's LAN IP, and make sure the
  phone is on the same network.
- Auth is email + password against `/auth/login` / `/auth/register`; the JWT
  is persisted in AsyncStorage and revalidated via `/auth/me` on launch.

### Google sign-in (AWS Cognito Hosted UI)

Set two more env vars to light up the "Continue with Google" buttons:

```bash
EXPO_PUBLIC_COGNITO_DOMAIN=your-domain.auth.us-east-1.amazoncognito.com
EXPO_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
```

In the Cognito app client: enable the **Google** identity provider, the
**authorization code** OAuth flow with `openid email profile` scopes, and add
the app's redirect URI to the allowed callback URLs. The app logs its exact
redirect URI to the console when you tap the button (`reherza://auth` in a
standalone build; an `exp://…` URI inside Expo Go). The received ID token is
exchanged for the app JWT via `POST /api/auth/cognito-sync`.

### Self-tapes

The Studio records real video (front camera + mic, 3-2-1 countdown, live
teleprompter showing your first line). Take Review plays the clip back and
uploads it: `POST /api/storage/uploads/request-url` → `PUT` the bytes →
`POST /api/projects/:id/selftapes`. Share ↗ opens the system share sheet.

Then:
- Press **i** for the iOS simulator (Xcode required, macOS)
- Press **a** for an Android emulator (Android Studio required)
- Or scan the QR code with the **Expo Go** app on a physical device

### Building real store binaries

This project is EAS-ready. To produce installable builds:

```bash
npm install -g eas-cli
eas login
eas build:configure
eas build --platform ios       # App Store / TestFlight
eas build --platform android   # Play Store / APK
```

## What's included (18 mockups → 16 RN screens)

**Auth:** Sign In · Create Account · Verify Email · Reset Password
**Core (bottom tabs):** Home · Playhouse · Rehearse · Profile & Settings
**Flow:** New Script · Parsing · Script Detail · Script Editor
**Immersive:** Rehearsal Room (AI-speaking + your-turn states) · Studio self-tape · Take Review · Session Results

The web app ships a single light theme; mobile adds **Stage**, built from the
landing page's dark-section surfaces (`--rz-stage*`), for rehearsing in a dark
room. Both are the same tokens — tap the avatar on Home, or use **Appearance**
in Profile, to flip. Immersive screens (Parsing, Studio) are always on Stage.

## Project structure

```
reherza-native/
├── App.tsx                    # Fonts, theme provider, navigation container
├── app.json                   # Expo config (bundle ids, splash)
├── src/
│   ├── theme.ts               # Design tokens: palette, gradient, fonts, radii
│   ├── ThemeContext.tsx       # useTheme() + Light/Stage toggle
│   ├── lib/scoreColors.ts     # 0-100 score → band colour + label
│   ├── components/            # GradientButton, Field, Card, Badge, Waveform, Bits…
│   ├── navigation/            # RootNavigator (stack) + TabNavigator (tabs)
│   └── screens/               # One file per screen
```

## Design system notes

`src/theme.ts` is the single source of truth and mirrors the web's
`styles/theme.css`. Read colours with `const { theme } = useTheme()` — never
hard-code a hex outside `theme.ts`. The rules it inherits from the web palette:

1. **Brand blue `#2563EB` is the only colour that means "interactive."** Nothing
   untappable uses it, and no data encoding may use it.
2. **One gradient.** The blue→cyan sweep (`brandGradient`) is reserved for hero
   moments: the primary CTA, the plan hero, the progress fill, the mic button,
   avatars. Not on every card — that restraint is what keeps it a highlight
   rather than wallpaper. Use `gradientStart/End` for the 90° sweep,
   `diagonalStart/End` for the 135° one on large rectangles.
3. **Status colours sit outside the brand ramp**, so a failing state never reads
   as "on brand". Each has a readable TEXT step and a brighter FILL step; they
   are not interchangeable (amber-500 as text is 2.15:1).
4. **The "rec" dot stays red.** It is a recording light, not a brand accent, and
   it never means "error".
5. **Scores use the ramp in `lib/scoreColors.ts`** — monotonic, no blue, one set
   of thresholds so a colour and its label can never disagree.
6. **Line ownership is a role, not a hue.** `tpYou` / `tpPartner` colour the
   teleprompter, the editor's Me/AI toggle and the rehearsal room together, so
   an actor can tell their line from the AI's mid-take.

- **Type:** Manrope, the one project typeface — weight carries the hierarchy.
  There is deliberately no second display face.
- **Icons:** `@expo/vector-icons` (Feather). The only hand-drawn SVG is
  `GoogleMark`, which has to keep Google's own brand colours.

## Wiring up real functionality

The screens are fully styled and navigable with mock data. To ship, replace:
- `src/data.js` → your scripts/user API
- Studio/Rehearsal mic + camera → `expo-av` / `expo-camera` + a
  speech-to-text/TTS provider
- Auth screens → your identity provider (the buttons already navigate the flow)
