import { useCallback, useEffect, useRef } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as Google from 'expo-auth-session/providers/google';
import Constants, { ExecutionEnvironment } from 'expo-constants';

WebBrowser.maybeCompleteAuthSession();

// iOS ネイティブビルド（Development / Staging / Production）用クライアント
const IOS_CLIENT_ID =
  '134608896734-hb1nj0rmlgva07vf6ejlmb1lb6mhr1pi.apps.googleusercontent.com';

// Expo Go では exp:// スキームが使われるため Google OAuth が動作しない。
// Development Build（eas build --profile development）以降で実 OAuth が使用される。
// appOwnership は SDK 52 で非推奨となり Expo Go でも 'expo' を返さないため
// executionEnvironment（StoreClient = Expo Go）で判定する
const IS_EXPO_GO =
  Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

// Expo Go でのUI確認用モックユーザー
const MOCK_USER_INFO = {
  id: 'mock-id',
  name: 'Mock User (Expo Go)',
  email: 'mock@example.com',
  picture: '',
};

// authorization-code フローのトークン交換を待つ上限
const TOKEN_EXCHANGE_TIMEOUT_MS = 30000;

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

  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: IOS_CLIENT_ID,
    redirectUri,
  });

  // ネイティブ既定の authorization-code フローでは promptAsync の戻り値に
  // authentication が含まれず、トークン交換完了後の結果は useAuthRequest の
  // 第2要素（response）へ非同期に反映される。signIn から await できるよう
  // response の更新を Promise にブリッジする。
  // 同一フックで複数回サインインしても過去の試行のトークン・タイムアウトを
  // 誤って適用しないよう、auth code で試行を照合する
  const responseRef = useRef(response);
  const pendingRef = useRef<{
    code: string | undefined;
    resolve: (token: string) => void;
    reject: (err: Error) => void;
    timeoutId?: ReturnType<typeof setTimeout>;
  } | null>(null);

  useEffect(() => {
    responseRef.current = response;
    const pending = pendingRef.current;
    if (!pending || !response) return;

    if (response.type === 'success') {
      // 過去の試行（別の auth code）の結果は無視する
      if (response.params?.code !== pending.code) return;
      const token = response.authentication?.accessToken;
      // token が入るまでは交換完了待ち（response 更新のたびに再評価される）
      if (token) {
        pendingRef.current = null;
        if (pending.timeoutId) clearTimeout(pending.timeoutId);
        pending.resolve(token);
      }
    } else if (response.type === 'error') {
      pendingRef.current = null;
      if (pending.timeoutId) clearTimeout(pending.timeoutId);
      pending.reject(
        response.error ?? new Error('Google authentication failed'),
      );
    }
  }, [response]);

  const waitForExchangedToken = useCallback(
    (expectedCode: string | undefined): Promise<string> => {
      // 今回の auth code に対する交換が完了済みならその場で返す
      // （過去のサインインのトークンは code 不一致となり再利用しない）
      const current = responseRef.current;
      if (
        current?.type === 'success' &&
        current.authentication?.accessToken &&
        current.params?.code === expectedCode
      ) {
        return Promise.resolve(current.authentication.accessToken);
      }

      return new Promise<string>((resolve, reject) => {
        // 先行する交換待ちが残っていれば reject で確実に settle させてから
        // 置き換える（先行呼び出し元のローディングが固まらないように）
        const previous = pendingRef.current;
        if (previous) {
          pendingRef.current = null;
          if (previous.timeoutId) clearTimeout(previous.timeoutId);
          previous.reject(
            new Error('Google sign-in was superseded by a new attempt'),
          );
        }

        const pending: NonNullable<typeof pendingRef.current> = {
          code: expectedCode,
          resolve,
          reject,
        };
        // 交換リクエストが失敗すると response が更新されないため、
        // 無期限に待たないようタイムアウトさせてエラー通知につなげる。
        // 自分の待機がまだ生きている場合のみ破棄する（後続の試行は巻き込まない）
        pending.timeoutId = setTimeout(() => {
          if (pendingRef.current === pending) {
            pendingRef.current = null;
            reject(new Error('Timed out waiting for Google token exchange'));
          }
        }, TOKEN_EXCHANGE_TIMEOUT_MS);
        pendingRef.current = pending;
      });
    },
    [],
  );

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
    // ユーザーによるキャンセル（dismiss / cancel）のみ null を返して無通知にする。
    // OAuth の実エラーは throw して呼び出し側の catch（エラーアラート）へつなげる
    if (result.type === 'error') {
      throw result.error ?? new Error('Google authentication failed');
    }
    if (result.type !== 'success') return null;

    // implicit フロー等で即時トークンが得られればそれを使い、
    // code フローではトークン交換の完了（response への反映）を待つ
    const token =
      result.authentication?.accessToken ??
      (await waitForExchangedToken(result.params?.code));

    return fetchUserInfo(token);
  }, [promptAsync, fetchUserInfo, waitForExchangedToken]);

  return { signIn, ready: IS_EXPO_GO || !!request };
}
