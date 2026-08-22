// メール認証コード（TASK-85）関連の共有ユーティリティ。
// Register / PasswordReset の両画面で同じ失敗理由 → 文言の変換を使う。

// API が 400 で返す reason（code_invalid など）をユーザー向け文言に変換する。
// 認証コード起因でない失敗は null を返し、呼び出し側の既存エラー処理に委ねる。
export function verificationCodeFailureMessage(
  reason: unknown,
): string | null {
  switch (reason) {
    case 'code_invalid':
      return '認証コードが正しくありません。もう一度入力してください。';
    case 'code_expired':
      return '認証コードの有効期限が切れています。認証コードを再送してください。';
    case 'code_attempts_exceeded':
      return '認証コードの入力回数が上限を超えました。認証コードを再送してください。';
    default:
      return null;
  }
}
