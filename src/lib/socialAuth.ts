// Social sign-in ("Continue with Google" / "Sign in with Apple") via the
// AWS Cognito Hosted UI.
//
// Flow: open Cognito's /oauth2/authorize with the chosen identity provider →
// user signs in → Cognito redirects back with a code → exchange the code
// (PKCE) for tokens at /oauth2/token → hand the ID token to the backend
// (POST /api/auth/cognito-sync) which returns the app's own { user, token }.
//
// Apple note: App Store guideline 4.8 requires an equivalent privacy-focused
// login whenever third-party login (Google) is offered — hence the Apple
// provider, shown on iOS.
import { useEffect, useRef, useState } from 'react';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { COGNITO_DOMAIN, COGNITO_CLIENT_ID } from '../config';

WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = 'Google' | 'SignInWithApple';

export const socialAuthConfigured: boolean = Boolean(COGNITO_DOMAIN && COGNITO_CLIENT_ID);

const discovery: AuthSession.DiscoveryDocument | null = socialAuthConfigured
  ? {
      authorizationEndpoint: `https://${COGNITO_DOMAIN}/oauth2/authorize`,
      tokenEndpoint: `https://${COGNITO_DOMAIN}/oauth2/token`,
      revocationEndpoint: `https://${COGNITO_DOMAIN}/oauth2/revoke`,
    }
  : null;

export interface SocialAuthHandle {
  available: boolean;
  busy: boolean;
  redirectUri: string; // register this in the Cognito app client's callback URLs
  prompt: () => void;
}

// onIdToken(idToken) is called once Cognito hands back a verified ID token.
export function useSocialAuth(
  provider: SocialProvider,
  onIdToken: (idToken: string) => Promise<void>,
  onError?: (e: Error) => void
): SocialAuthHandle {
  const [busy, setBusy] = useState(false);
  const cbRef = useRef({ onIdToken, onError });
  cbRef.current = { onIdToken, onError };

  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'reherza', path: 'auth' });

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    socialAuthConfigured
      ? {
          clientId: COGNITO_CLIENT_ID,
          responseType: AuthSession.ResponseType.Code,
          scopes: ['openid', 'email', 'profile'],
          redirectUri,
          usePKCE: true,
          extraParams: { identity_provider: provider },
        }
      : { clientId: 'unconfigured', redirectUri, scopes: [] },
    discovery
  );

  useEffect(() => {
    if (!socialAuthConfigured || !response || !discovery) return;
    if (response.type === 'success') {
      void (async () => {
        setBusy(true);
        try {
          const tokens = await AuthSession.exchangeCodeAsync(
            {
              clientId: COGNITO_CLIENT_ID,
              code: response.params.code,
              redirectUri,
              extraParams: request?.codeVerifier ? { code_verifier: request.codeVerifier } : {},
            },
            discovery
          );
          if (!tokens.idToken) throw new Error('Cognito returned no ID token.');
          await cbRef.current.onIdToken(tokens.idToken);
        } catch (e) {
          cbRef.current.onError?.(e instanceof Error ? e : new Error(String(e)));
        } finally {
          setBusy(false);
        }
      })();
    } else if (response.type === 'error') {
      cbRef.current.onError?.(
        new Error(response.error?.description || 'Sign-in was cancelled or failed.')
      );
    }
  }, [response]);

  return {
    available: socialAuthConfigured,
    busy,
    redirectUri,
    prompt: () => {
      if (!socialAuthConfigured) return;
      if (__DEV__) {
        console.log('[socialAuth] redirect URI (add to Cognito callback URLs):', redirectUri);
      }
      void promptAsync();
    },
  };
}
