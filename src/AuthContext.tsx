import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Auth, ApiError, loadToken, setToken } from './api';
import type { User } from './types';

interface AuthContextValue {
  user: User | null;
  restoring: boolean;
  signIn: (email: string, password: string) => Promise<User>;
  signUp: (name: string, email: string, password: string) => Promise<User>;
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
  signInWithCognito: async () => {
    throw new Error('AuthProvider missing');
  },
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);

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

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      restoring,
      signIn: async (email, password) => {
        const { user: u, token } = await Auth.login(email, password);
        await setToken(token);
        setUser(u);
        return u;
      },
      signUp: async (name, email, password) => {
        const { user: u, token } = await Auth.register(name, email, password);
        await setToken(token);
        setUser(u);
        return u;
      },
      // Exchange a verified Cognito (Google / Apple) ID token for the app JWT.
      signInWithCognito: async (idToken) => {
        const { user: u, token } = await Auth.cognitoSync(idToken);
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
    [user, restoring]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
