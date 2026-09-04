// Where the Reherza backend lives. Every path in the API doc is prefixed
// with /api, so include it here. Override per environment:
//   EXPO_PUBLIC_API_URL=https://your-host.com/api npx expo start
// Android emulator note: "localhost" is the emulator itself — use your
// machine's LAN IP or 10.0.2.2 to reach a server on your Mac.
//
// SECURITY: production builds must use HTTPS. iOS App Transport Security
// and Android's cleartext policy both block plain http:// to non-local
// hosts by default — do not weaken those; point this at an https:// URL.
export const API_URL: string = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000/api';

if (!__DEV__ && API_URL.startsWith('http://')) {
  // Fail loudly rather than ship a release build talking cleartext HTTP.
  console.error('Reherza: API_URL must be https:// in production builds.');
}

// AWS Cognito Hosted UI — powers "Continue with Google" and
// "Sign in with Apple". Set both values to enable the buttons:
//   EXPO_PUBLIC_COGNITO_DOMAIN=your-domain.auth.us-east-1.amazoncognito.com
//   EXPO_PUBLIC_COGNITO_CLIENT_ID=xxxxxxxxxxxxxxxxxxxxxxxxxx
// The app client must have the Google (and Apple) identity providers
// enabled, the "code" OAuth flow, openid/email/profile scopes, and this
// app's redirect URI in its allowed callback URLs (it's `reherza://auth`
// in a standalone build, an exp://… URI inside Expo Go).
export const COGNITO_DOMAIN: string = process.env.EXPO_PUBLIC_COGNITO_DOMAIN || '';
export const COGNITO_CLIENT_ID: string = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID || '';

// Region for the Cognito Identity Provider API (sign-up, confirm, sign-in,
// forgot password — see src/lib/cognito.ts). Falls back to reading it out of
// the hosted-UI domain, which is always `<prefix>.auth.<region>.amazoncognito.com`,
// so a correctly configured COGNITO_DOMAIN is usually enough on its own.
//
// The app client must have USER_PASSWORD_AUTH enabled as an explicit auth flow;
// without it, email/password sign-in returns InvalidParameterException.
export const COGNITO_REGION: string =
  process.env.EXPO_PUBLIC_COGNITO_REGION ||
  COGNITO_DOMAIN.match(/\.auth\.([a-z0-9-]+)\.amazoncognito\.com/)?.[1] ||
  '';

// The marketing/app website. Legal documents are read from here in a WebView
// (see src/legal.ts for why the text is not bundled), so this must point at the
// deployment whose /eula, /privacy, /community-guidelines and /refund-policy
// pages match the versions in that registry.
export const WEB_URL: string = (
  process.env.EXPO_PUBLIC_WEB_URL || 'https://reherza.com'
).replace(/\/$/, '');

// Legal documents — linked from Create Account (required by both stores).
// Previously these pointed at reherza.co, which is not the site: the pages live
// on reherza.com, so both links opened a dead host.
export const TERMS_URL: string = `${WEB_URL}/eula`;
export const PRIVACY_URL: string = `${WEB_URL}/privacy`;
