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

// 認証コード送信後にコード入力ステップへ表示する案内文 (TASK-104)。
// API は登録の有無にかかわらず同じ 200 を返す（アカウント列挙対策）ため、
// 「登録済みなら案内メールが届く」「未登録ならメールは届かない」ことを画面で補足する。
export function verificationSentNotice(
  purpose: 'register' | 'reset',
  email: string,
): string {
  if (purpose === 'register') {
    return [
      `${email} 宛に 6 桁の認証コードを送信しました。`,
      'メールに記載されたコードを入力してください。',
      '※ すでに登録済みのメールアドレスの場合は、認証コードの代わりに登録済みである旨のメールが届きます。',
    ].join('\n');
  }
  return [
    `${email} 宛に 6 桁の認証コードを送信しました。`,
    'コードと新しいパスワードを入力してください。',
    '※ 認証コードは登録済みのメールアドレスにのみ届きます。届かない場合はメールアドレスをご確認ください。',
  ].join('\n');
}
