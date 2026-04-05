import { useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';

WebBrowser.maybeCompleteAuthSession();

const IOS_CLIENT_ID =
  '134608896734-hb1nj0rmlgva07vf6ejlmb1lb6mhr1pi.apps.googleusercontent.com';

export interface GoogleUserInfo {
  id: string;
  name: string;
  email: string;
  picture: string;
}

export function useGoogleAuth() {
  const redirectUri = AuthSession.makeRedirectUri({ scheme: 'com.yoshiydp.lyricsapp' });

  const [request, , promptAsync] = Google.useAuthRequest({
    iosClientId: IOS_CLIENT_ID,
    redirectUri,
  });

  const fetchUserInfo = useCallback(
    async (accessToken: string): Promise<GoogleUserInfo> => {
      const res = await fetch('https://www.googleapis.com/userinfo/v2/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to fetch Google user info');
      return res.json();
    },
    [],
  );

  const signIn = useCallback(async (): Promise<GoogleUserInfo | null> => {
    const result = await promptAsync();
    if (result.type !== 'success') return null;

    const token = result.authentication?.accessToken;
    if (!token) return null;

    return fetchUserInfo(token);
  }, [promptAsync, fetchUserInfo]);

  return { signIn, ready: !!request };
}
