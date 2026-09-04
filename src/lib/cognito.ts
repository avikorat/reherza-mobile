import { COGNITO_CLIENT_ID, COGNITO_REGION } from '../config';

// ── AWS Cognito Identity Provider, over its plain JSON API ───────────────────
//
// The web talks to Cognito through aws-amplify. This app calls the same
// operations directly instead: every one used here is UNAUTHENTICATED and needs
// only the app client id — no request signing, no credentials, no SDK. That
// keeps the app free of Amplify's native modules (@aws-amplify/react-native and
// its crypto/URL polyfills), which would rule out testing in Expo Go.
//
// The wire format is AWS JSON 1.1: the operation goes in X-Amz-Target and the
// input is the POST body. Errors come back as HTTP 400 with an `__type` naming
// the exception, which is what callers branch on.

const TARGET_PREFIX = 'AWSCognitoIdentityProviderService';

export class CognitoError extends Error {
  /** e.g. 'UserNotFoundException', 'CodeMismatchException'. '' if unparseable. */
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'CognitoError';
    this.code = code;
  }
}

/** Is Cognito configured for this build? Both values come from app config. */
export function cognitoConfigured(): boolean {
  return Boolean(COGNITO_CLIENT_ID && COGNITO_REGION);
}

/**
 * Trimmed + lower-cased, so ONE person is ONE account.
 *
 * Sign-up talks to Cognito directly, bypassing the backend's normalisation, so
 * on a case-sensitive pool "Jane@x.com" and "jane@x.com" would become two
 * Cognito users — and the second then collides on the database's unique email.
 * Mirrors `normalizedEmail` in backend/src/routes/auth.ts and the same
 * canonicalisation in the web's register/login forms.
 */
export function canonicalEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

// Cognito's exception names are precise but not addressed to a person. Map the
// ones a user can actually hit; anything else falls through to the service's own
// message, which is usually serviceable.
const MESSAGES: Record<string, string> = {
  UsernameExistsException: 'An account with that email already exists. Try signing in.',
  CodeMismatchException: "That code doesn't match. Check it and try again.",
  ExpiredCodeException: 'That code has expired — request a new one.',
  NotAuthorizedException: 'Incorrect email or password.',
  UserNotFoundException: 'No account found for that email.',
  UserNotConfirmedException: 'Confirm your email address to continue.',
  InvalidPasswordException: "That password doesn't meet the requirements.",
  LimitExceededException: 'Too many attempts — wait a few minutes and try again.',
  TooManyRequestsException: 'Too many attempts — wait a few minutes and try again.',
  TooManyFailedAttemptsException: 'Too many failed attempts — wait a few minutes.',
};

async function call<T>(operation: string, body: Record<string, unknown>): Promise<T> {
  if (!cognitoConfigured()) {
    throw new CognitoError(
      'NotConfigured',
      'Sign-in is not configured for this build. Set EXPO_PUBLIC_COGNITO_CLIENT_ID and EXPO_PUBLIC_COGNITO_DOMAIN.'
    );
  }

  let res: Response;
  try {
    res = await fetch(`https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-amz-json-1.1',
        'X-Amz-Target': `${TARGET_PREFIX}.${operation}`,
      },
      body: JSON.stringify({ ClientId: COGNITO_CLIENT_ID, ...body }),
    });
  } catch {
    throw new CognitoError('NetworkError', "Can't reach the sign-in service. Check your connection.");
  }

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }

  if (!res.ok) {
    // `__type` is either the bare name or "com.amazonaws...#Name".
    const raw = typeof data.__type === 'string' ? data.__type : '';
    const code = raw.includes('#') ? raw.split('#')[1] : raw;
    const serviceMessage =
      typeof data.message === 'string'
        ? data.message
        : typeof data.Message === 'string'
          ? data.Message
          : '';
    throw new CognitoError(code, MESSAGES[code] || serviceMessage || `Sign-in failed (${res.status})`);
  }
  return data as T;
}

interface CodeDelivery {
  CodeDeliveryDetails?: { Destination?: string };
}

export const Cognito = {
  /**
   * Create the Cognito user. Returns whether a confirmation code was emailed —
   * most pools require one, but a pool configured to auto-confirm returns
   * `userConfirmed: true` and the caller should skip straight to sign-in.
   *
   * `phone_number` is deliberately not sent: the production pool marks no
   * standard attribute as required, and this form doesn't collect one.
   * `family_name` is omitted rather than sent empty — Cognito rejects an empty
   * string for a standard attribute even when it isn't required.
   */
  signUp: async (email: string, password: string, firstName: string, lastName: string) => {
    const attrs: Array<{ Name: string; Value: string }> = [
      { Name: 'email', Value: email },
      { Name: 'given_name', Value: firstName },
    ];
    if (lastName) attrs.push({ Name: 'family_name', Value: lastName });
    const r = await call<CodeDelivery & { UserConfirmed?: boolean }>('SignUp', {
      Username: email,
      Password: password,
      UserAttributes: attrs,
    });
    return {
      userConfirmed: Boolean(r.UserConfirmed),
      destination: r.CodeDeliveryDetails?.Destination,
    };
  },

  confirmSignUp: (email: string, code: string) =>
    call<unknown>('ConfirmSignUp', { Username: email, ConfirmationCode: code }).then(() => undefined),

  resendSignUpCode: async (email: string) => {
    const r = await call<CodeDelivery>('ResendConfirmationCode', { Username: email });
    return { destination: r.CodeDeliveryDetails?.Destination };
  },

  /** Email + password sign-in. Requires USER_PASSWORD_AUTH on the app client. */
  signIn: async (email: string, password: string) => {
    const r = await call<{ AuthenticationResult?: { IdToken?: string } }>('InitiateAuth', {
      AuthFlow: 'USER_PASSWORD_AUTH',
      AuthParameters: { USERNAME: email, PASSWORD: password },
    });
    const idToken = r.AuthenticationResult?.IdToken;
    if (!idToken) {
      // A pool with MFA or a forced password reset answers with a challenge
      // instead of tokens. Neither is configured here, so treat it as a state
      // this app can't complete rather than silently signing nobody in.
      throw new CognitoError('ChallengeRequired', 'This account needs extra verification to sign in.');
    }
    return { idToken };
  },

  forgotPassword: async (email: string) => {
    const r = await call<CodeDelivery>('ForgotPassword', { Username: email });
    return { destination: r.CodeDeliveryDetails?.Destination };
  },

  confirmForgotPassword: (email: string, code: string, newPassword: string) =>
    call<unknown>('ConfirmForgotPassword', {
      Username: email,
      ConfirmationCode: code,
      Password: newPassword,
    }).then(() => undefined),
};
