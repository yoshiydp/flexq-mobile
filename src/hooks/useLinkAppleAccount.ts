import { useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useModal } from '@/contexts/ModalContext';
import { useAppleAuth } from '@/hooks/useAppleAuth';

/**
 * プロフィールの「Link Social Accounts」から、ログイン中のアカウントに
 * Apple ID を連携する（TASK-132）
 *
 * 「メールを非公開」を選んだ人や Apple ID のメールが登録メールと違う人は、
 * Apple でサインインしたときのメール一致の自動ひも付けが効かないため、
 * いつものログイン方法でログインしてからここで連携する。
 * 連携後はその Apple ID でこのアカウントにサインインできる（post-profile-link-apple）。
 *
 * Apple でサインインは iOS のみ提供のため、Android では案内だけ表示する
 * （一覧から Apple を外すと、保存時に socialAccounts の apple エントリが消えてしまう）。
 */
export function useLinkAppleAccount() {
  const { signIn, available } = useAppleAuth();
  const { showLoading, hideLoading } = useModal();

  /**
   * Apple の認証シートを開いて連携する。成功したら一覧に表示する名前
   * （Apple ID のメール。中継アドレスの場合もある）を返し、キャンセル・失敗時は
   * null を返す（失敗時のアラートはここで表示する）
   */
  const linkApple = useCallback(async (): Promise<string | null> => {
    if (!available) {
      Alert.alert(
        'Apple ID の連携',
        Platform.OS === 'ios'
          ? 'この端末では Apple でサインインを利用できません。'
          : 'Apple ID の連携は iPhone のアプリから行えます。',
      );
      return null;
    }

    let loading = false;
    try {
      // キャンセル（null）は無通知
      const credential = await signIn();
      if (!credential) return null;

      showLoading();
      loading = true;
      const res = await DefaultService.postDataProfileLinkApple({
        identityToken: credential.identityToken,
        authorizationCode: credential.authorizationCode,
        rawNonce: credential.rawNonce,
      });
      return res?.email || 'Apple ID';
    } catch (err: any) {
      console.error('Failed to link Apple ID:', err);
      if (err?.status === 409) {
        Alert.alert(
          'エラー',
          'この Apple ID はすでに別の FlexQ アカウントに連携されています。',
        );
      } else {
        Alert.alert('エラー', 'Apple ID の連携に失敗しました。');
      }
      return null;
    } finally {
      if (loading) hideLoading();
    }
  }, [available, signIn, showLoading, hideLoading]);

  return { linkApple };
}
