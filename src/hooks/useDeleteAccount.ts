import { useState } from 'react';
import { DefaultService } from '@/apiClient/services/DefaultService';

/**
 * アカウント削除（退会）API を呼び出す hook (TASK-80)
 * DELETE /data/profile はユーザーの全データ（プロジェクト・トラック・
 * 録音・メモ・S3 ファイル・Users レコード）を物理削除する。
 */
export function useDeleteAccount() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const deleteAccount = async () => {
    setLoading(true);
    setError(null);
    try {
      await DefaultService.deleteProfile();
    } catch (err: any) {
      // 404 は削除済み（例: 大量データでゲートウェイタイムアウト後の
      // リトライで Users レコードがすでに消えているケース）とみなし成功扱いにする
      if (err?.status === 404) return;

      // ゲートウェイタイムアウト等（5xx）は Lambda 側で削除が完走している
      // 可能性があるため、プロフィール取得で削除完了（404）を確認できたら
      // 成功扱いにする。まだユーザーが残っている（200）・判定不能な場合は
      // 元のエラーを投げてユーザーの再実行に委ねる（再実行は 404 で収束する）
      try {
        await DefaultService.getProfile();
      } catch (verifyErr: any) {
        if (verifyErr?.status === 404) return;
      }
      setError(err as Error);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return { deleteAccount, loading, error };
}
