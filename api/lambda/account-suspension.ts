/**
 * アカウント停止（BAN・論理削除）の純粋ロジック (TASK-81)
 * AWS SDK に依存しないヘルパーのみを置く（auth-middleware.ts /
 * post-auth-login.ts / post-auth-google.ts / post-auth-refresh.ts から利用。
 * account-deletion.ts と同じくユニットテスト対象）。
 *
 * Users レコードの status:
 *   - 'active' または未設定 → 通常ユーザー（既存レコードは status を持たない）
 *   - 'suspended'           → 停止中（suspendedAt に停止日時を保持）
 * 物理削除ではなく論理削除にすることで、同じ email / Google アカウントでの
 * 再登録を防ぎ（email-index に残るため register は 409 になる）、
 * 証拠保全・誤判定時の復元を可能にする。
 */

/** ユーザーが停止中かどうか。status 未設定（既存レコード）は active 扱い */
export function isSuspendedUser(
  user: { status?: unknown } | null | undefined,
): boolean {
  return user?.status === 'suspended';
}

/** 停止中ユーザーのログイン・リフレッシュ拒否レスポンス（403） */
export function suspendedResponse() {
  return {
    statusCode: 403,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ message: 'Account suspended' }),
  };
}

/**
 * ユーザー単位の TTL 付きキャッシュ（Lambda コンテナ単位）。
 * 全 API リクエストごとの DynamoDB 参照を抑えつつ、BAN やセッション失効
 * （tokenVersion・TASK-105）を TTL 以内に反映させるためのトレードオフ。
 * 時刻は引数で注入できる（テスト用）。
 */
export interface TtlCache<T> {
  /** キャッシュ済みなら値、未キャッシュ・期限切れなら undefined */
  get(userId: string, now?: number): T | undefined;
  set(userId: string, value: T, now?: number): void;
}

export function createTtlCache<T>(ttlMs: number): TtlCache<T> {
  const entries = new Map<string, { value: T; expiresAt: number }>();
  return {
    get(userId, now = Date.now()) {
      const entry = entries.get(userId);
      if (!entry) return undefined;
      if (now >= entry.expiresAt) {
        entries.delete(userId);
        return undefined;
      }
      return entry.value;
    },
    set(userId, value, now = Date.now()) {
      entries.set(userId, { value, expiresAt: now + ttlMs });
    },
  };
}
