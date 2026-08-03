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

// Legal documents — linked from Create Account (required by both stores).
export const TERMS_URL: string =
  process.env.EXPO_PUBLIC_TERMS_URL || 'https://reherza.co/terms';
export const PRIVACY_URL: string =
  process.env.EXPO_PUBLIC_PRIVACY_URL || 'https://reherza.co/privacy';
