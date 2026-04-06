import { useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import Constants from 'expo-constants';

WebBrowser.maybeCompleteAuthSession();

// iOS ネイティブビルド（Development / Staging / Production）用クライアント
const IOS_CLIENT_ID =
  '134608896734-hb1nj0rmlgva07vf6ejlmb1lb6mhr1pi.apps.googleusercontent.com';

// Expo Go では exp:// スキームが使われるため Google OAuth が動作しない。
// Development Build（eas build --profile development）以降で実 OAuth が使用される。
const IS_EXPO_GO = Constants.appOwnership === 'expo';

// Expo Go でのUI確認用モックユーザー
const MOCK_USER_INFO = {
  id: 'mock-id',
  name: 'Mock User (Expo Go)',
  email: 'mock@example.com',
  picture: '',
};

export interface GoogleUserInfo {
  id: string;
  name: string;
  email: string;
  picture: string;
}

export function useGoogleAuth() {
  // Development Build / Staging Build / Production は全てカスタムスキームを使用
  const redirectUri = AuthSession.makeRedirectUri({
    scheme: 'com.yoshiydp.lyricsapp',
  });

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
    // Expo Go: 実 OAuth は動作しないためモックを返す
    // 実際の Google 認証は Development Build 以降で動作する
    if (IS_EXPO_GO) {
      return MOCK_USER_INFO;
    }

    const result = await promptAsync();
    if (result.type !== 'success') return null;

    const token = result.authentication?.accessToken;
    if (!token) return null;

    return fetchUserInfo(token);
  }, [promptAsync, fetchUserInfo]);

  return { signIn, ready: IS_EXPO_GO || !!request };
}
