import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';

/**
 * Apple でサインイン（TASK-132）
 *
 * App Store 審査ガイドライン 4.8 対応（Google ログインを提供するため、
 * 同等のプライバシー配慮があるログイン手段として iOS に追加する）。
 * Android には提供しない（ガイドラインは iOS アプリが対象で、Android では
 * Apple の Web 認証が必要になるため）。
 *
 * 取得した identityToken はサーバー（POST /data/auth/apple）で Apple の
 * 公開鍵により検証する。リプレイ対策として、生の nonce の SHA-256 を Apple に
 * 渡し、生の値をサーバーへ送ってトークンの nonce クレームと照合させる。
 */

export interface AppleSignInResult {
  identityToken: string;
  authorizationCode: string | null;
  rawNonce: string;
  /** Apple は氏名を初回の認可時にしか返さない（2 回目以降は null） */
  fullName: { givenName: string | null; familyName: string | null } | null;
}

/** ユーザーが Apple の認証シートを閉じたときのエラーコード */
const CANCELED_CODE = 'ERR_REQUEST_CANCELED';
/**
 * 端末が Apple ID にサインインしていないと、OS が「Apple Account に
 * サインインしてください」のダイアログを出し、「閉じる」を押すと
 * キャンセルではなくこのコード（ASAuthorizationError.unknown）で返る。
 * ユーザーが自分で閉じた操作なので、キャンセルと同じく無通知にする
 * （本当に原因不明で失敗した場合も黙るため、調査用に warn だけ残す）
 */
const UNKNOWN_CODE = 'ERR_REQUEST_UNKNOWN';

export function useAppleAuth() {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let mounted = true;
    AppleAuthentication.isAvailableAsync()
      .then((isAvailable) => {
        if (mounted) setAvailable(isAvailable);
      })
      .catch(() => {
        if (mounted) setAvailable(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  /**
   * Apple の認証シートを開く。キャンセル（未サインイン端末の案内ダイアログを
   * 閉じた場合を含む）は null を返して無通知にし、それ以外の失敗は throw して
   * 呼び出し側の catch（エラーアラート）へつなげる
   */
  const signIn = useCallback(async (): Promise<AppleSignInResult | null> => {
    const rawNonce = Crypto.randomUUID();
    const hashedNonce = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      rawNonce,
    );

    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
        nonce: hashedNonce,
      });
    } catch (err: any) {
      if (err?.code === CANCELED_CODE) return null;
      if (err?.code === UNKNOWN_CODE) {
        console.warn('Apple sign-in ended without a credential:', err);
        return null;
      }
      throw err;
    }

    if (!credential.identityToken) {
      throw new Error('Apple sign-in returned no identity token');
    }

    const { givenName = null, familyName = null } = credential.fullName ?? {};
    return {
      identityToken: credential.identityToken,
      authorizationCode: credential.authorizationCode,
      rawNonce,
      fullName: givenName || familyName ? { givenName, familyName } : null,
    };
  }, []);

  return { signIn, available };
}
