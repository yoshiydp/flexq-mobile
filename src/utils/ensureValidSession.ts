import { getAccessToken } from '@/utils/authStorage';
import { refreshAccessToken } from '@/utils/authTokenInterceptor';
import { isJwtExpired } from '@/utils/jwt';

/**
 * アクセストークンの有効性を確認し、失効していればリフレッシュを試みて
 * 「セッションが利用可能かどうか」を返す。
 *
 * - トークンが無い → false（未ログイン）
 * - exp が有効 → true（API 呼び出し可能）
 * - exp 切れ → refreshToken で再発行を試みる（TASK-32 の単一フライトを共用）
 *   - 再発行成功 → true（ログイン画面へは落とさない）
 *   - refreshToken 自体が失効 → インターセプター側でトークン破棄 +
 *     onSessionExpired 通知（AuthContext がログイン画面へ遷移）済み → false
 *   - ネットワークエラー → トークンは保持されたまま false（次回に再試行）
 */
export async function ensureValidSession(): Promise<boolean> {
  const accessToken = await getAccessToken();
  if (!accessToken) return false;
  if (!isJwtExpired(accessToken)) return true;

  const refreshed = await refreshAccessToken();
  return refreshed !== null;
}
