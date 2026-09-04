import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Auth, ApiError, loadToken, setToken } from './api';
import { acceptedVersions } from './legal';
import { Cognito, CognitoError, canonicalEmail, cognitoConfigured } from './lib/cognito';
import type { User } from './types';

/** What `signUp` asks the caller to do next. */
export type SignUpResult =
  /** Cognito emailed a code — send the user to VerifyEmail. */
  | { status: 'confirm'; email: string; destination?: string }
  /** The pool auto-confirmed; the user is signed in and `user` is set. */
  | { status: 'signedIn'; user: User };

interface AuthContextValue {
  user: User | null;
  restoring: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (first: string, last: string, email: string, password: string) => Promise<SignUpResult>;
  /** Finish a pending sign-up with the emailed code, then sign in. */
  confirmSignUp: (code: string) => Promise<User>;
  /** Re-send the confirmation code for the pending sign-up. */
  resendSignUpCode: () => Promise<{ destination?: string }>;
  /** Email of the sign-up awaiting confirmation, if any. */
  pendingEmail: string | null;
  signInWithCognito: (idToken: string) => Promise<User>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  restoring: true,
  signIn: async () => {
    throw new Error('AuthProvider missing');
  },
  signUp: async () => {
    throw new Error('AuthProvider missing');
  },
  confirmSignUp: async () => {
    throw new Error('AuthProvider missing');
  },
  resendSignUpCode: async () => {
    throw new Error('AuthProvider missing');
  },
  pendingEmail: null,
  signInWithCognito: async () => {
    throw new Error('AuthProvider missing');
  },
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);
  // Credentials for a sign-up awaiting its emailed code. Held in memory only —
  // never in navigation params, which React Navigation can serialise and
  // persist, and never in storage.
  const [pending, setPending] = useState<{ email: string; password: string } | null>(null);

  // Restore the persisted JWT on launch and re-validate it with /auth/me.
  useEffect(() => {
    (async () => {
      try {
        const token = await loadToken();
        if (token) setUser(await Auth.me());
      } catch (e) {
        if (e instanceof ApiError && (e.status === 401 || e.status === 404)) {
          await setToken(null);
        }
        // Network failure: keep the token; the user can still retry later.
      } finally {
        setRestoring(false);
      }
    })();
  }, []);

  // A verified Cognito ID token becomes the app's own JWT. Every path that
  // signs someone in ends here, so the accepted legal versions are attached in
  // one place — the server gates account CREATION on them and answers 422
  // without a current set.
  const exchange = async (idToken: string): Promise<User> => {
    const { user: u, token } = await Auth.cognitoSync(idToken, acceptedVersions());
    await setToken(token);
    setUser(u);
    setPending(null);
    return u;
  };

  const finishPending = async (email: string, password: string): Promise<User> => {
    const { idToken } = await Cognito.signIn(email, password);
    return exchange(idToken);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      restoring,
      // Cognito first, with the legacy password login as a fallback — the same
      // order the web uses. Accounts created before Cognito (including any made
      // by earlier builds of this app, which registered straight against the
      // backend) have no Cognito user, so their Cognito sign-in always fails and
      // the fallback is the only way in.
      signIn: async (rawEmail, password) => {
        const email = canonicalEmail(rawEmail);
        if (cognitoConfigured()) {
          try {
            const { idToken } = await Cognito.signIn(email, password);
            return await exchange(idToken);
          } catch (e) {
            if (e instanceof CognitoError && e.code === 'UserNotConfirmedException') {
              // Signed up but never confirmed. Re-arm the pending state so
              // VerifyEmail can finish the job with the password already in hand.
              setPending({ email, password });
              throw e;
            }
            // UserNotFound / NotAuthorized are exactly the shapes a legacy
            // account produces, so fall through and try the old route. Anything
            // else (network, throttling, a challenge) is a real failure.
            const fallback =
              e instanceof CognitoError &&
              (e.code === 'UserNotFoundException' || e.code === 'NotAuthorizedException');
            if (!fallback) throw e;
          }
        }
        const { user: u, token } = await Auth.login(email, password);
        await setToken(token);
        setUser(u);
        return u;
      },

      // Sign-up now creates a COGNITO user; the backend account is minted from
      // the resulting ID token by cognito-sync, once the email is confirmed.
      signUp: async (first, last, rawEmail, password) => {
        const email = canonicalEmail(rawEmail);
        // A build with no Cognito configured (local dev, or before the pool env
        // vars are set) still has to be able to create an account, so it takes
        // the legacy backend route. That path is complete now that the accepted
        // legal versions travel with it — it just produces an account the web's
        // Cognito login can't see, which is why it is the fallback and not the
        // default.
        if (!cognitoConfigured()) {
          const name = `${first.trim()} ${last.trim()}`.trim();
          const { user: u, token } = await Auth.register(name, email, password, acceptedVersions());
          await setToken(token);
          setUser(u);
          return { status: 'signedIn', user: u };
        }
        const { userConfirmed, destination } = await Cognito.signUp(
          email,
          password,
          first.trim(),
          last.trim()
        );
        setPending({ email, password });
        // Most pools email a code; one configured to auto-confirm does not, so
        // handle both rather than stranding the user on a code screen that will
        // never receive anything.
        if (userConfirmed) {
          const u = await finishPending(email, password);
          return { status: 'signedIn', user: u };
        }
        return { status: 'confirm', email, destination };
      },

      confirmSignUp: async (code) => {
        if (!pending) throw new Error('No sign-up is waiting to be confirmed.');
        await Cognito.confirmSignUp(pending.email, code);
        return finishPending(pending.email, pending.password);
      },

      resendSignUpCode: async () => {
        if (!pending) throw new Error('No sign-up is waiting to be confirmed.');
        return Cognito.resendSignUpCode(pending.email);
      },

      pendingEmail: pending?.email ?? null,
      // Exchange a verified Cognito (Google / Apple) ID token for the app JWT.
      signInWithCognito: async (idToken) => {
        const { user: u, token } = await Auth.cognitoSync(idToken, acceptedVersions());
        await setToken(token);
        setUser(u);
        return u;
      },
      signOut: async () => {
        Auth.logout().catch(() => {});
        await setToken(null);
        setUser(null);
      },
    }),
    [user, restoring, pending]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
