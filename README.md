# Reherza — React Native (Expo) app

A production-ready React Native codebase converting the Reherza high-fidelity
mockups into a real iOS + Android app. Built with Expo, React Navigation, and
`expo-linear-gradient`. The full design system (colors, typography, the
signature brand gradient, and both **Paper** and **Stage** themes) is encoded so
every screen stays on-brand and theme-switchable at runtime.

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

The Home Paper/Stage and Session Results Paper/Stage variants from the mockups
are handled by the **runtime theme switch** rather than duplicate screens — tap
the avatar on Home, or use **Appearance** in Profile, to flip themes.

## Project structure

```
reherza-native/
├── App.js                     # Fonts, theme provider, navigation container
├── app.json                   # Expo config (bundle ids, splash)
├── src/
│   ├── theme.js               # Design tokens: palettes, gradient, fonts, radii
│   ├── ThemeContext.js        # useTheme() + Paper/Stage toggle
│   ├── data.js                # Sample content — swap for your API
│   ├── components/            # GradientButton, Field, Card, Badge, Waveform, Bits…
│   ├── navigation/            # RootNavigator (stack) + TabNavigator (tabs)
│   └── screens/               # One file per screen
```

## Design system notes

- **Brand gradient** `#F5A623 → #E0561B → #C21807 → #9B111E` drives every primary
  action (`<GradientButton>`).
- **Fonts:** Archivo (UI/headings) + Playfair Display (stat numbers & spoken
  lines), loaded via `@expo-google-fonts`.
- **Themes:** `paper` (warm light) and `stage` (theatrical dark) live in
  `theme.js`. Read colors with `const { theme } = useTheme()`; never hard-code.
- **Icons:** `@expo/vector-icons` (Feather) — no hand-drawn SVGs to maintain.

## Wiring up real functionality

The screens are fully styled and navigable with mock data. To ship, replace:
- `src/data.js` → your scripts/user API
- Studio/Rehearsal mic + camera → `expo-av` / `expo-camera` + a
  speech-to-text/TTS provider
- Auth screens → your identity provider (the buttons already navigate the flow)
