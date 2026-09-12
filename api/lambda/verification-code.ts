/**
 * メール認証コード（6 桁 OTP）の純粋ロジック (TASK-85)
 * AWS SDK に依存しないヘルパーのみを置く（account-deletion.ts と同じく
 * ユニットテスト対象）。DynamoDB への保存・検証消費は
 * verification-code-store.ts が担う。
 */
import { createHmac, randomInt } from 'crypto';

// 新規登録のメール検証（ダブルオプトイン）とパスワードリセットの本人確認で共用する。
// コードは平文では保存せず、サーバー側シークレットを鍵にした HMAC-SHA256 で保存し、
// TTL（expiresAt）で自動削除される。素の SHA-256 だと 6 桁 = 100 万通りしかないため
// テーブル読み取りだけでオフライン総当たりが可能になる（Codex レビュー指摘）。

export const CODE_TTL_SECONDS = 600; // コードの有効期限: 10 分
export const RESEND_INTERVAL_SECONDS = 60; // 再送の最短間隔: 60 秒
export const MAX_ATTEMPTS = 5; // 検証の最大試行回数（超過でコード失効）

export type VerificationPurpose = 'register' | 'reset';

export interface StoredCode {
  email: string;
  purpose: VerificationPurpose;
  codeHash: string;
  expiresAt: number; // epoch 秒（DynamoDB TTL 属性）
  attempts: number;
  lastSentAt: number; // epoch ミリ秒
}

export type VerifyResult = 'ok' | 'invalid' | 'expired' | 'attempts_exceeded';

export function generateCode(): string {
  return String(randomInt(0, 1000000)).padStart(6, '0');
}

export function hashCode(code: string, pepper: string): string {
  return createHmac('sha256', pepper).update(code).digest('hex');
}

// 保存済みコードに対する検証判定（純粋関数）。
// 未発行・期限切れは 'expired'（再送を促す）、試行超過は 'attempts_exceeded'。
export function evaluateCode(
  item: Pick<StoredCode, 'codeHash' | 'expiresAt' | 'attempts'> | undefined,
  code: string,
  nowMs: number,
  pepper: string,
): VerifyResult {
  if (!item || item.expiresAt * 1000 <= nowMs) return 'expired';
  if (item.attempts >= MAX_ATTEMPTS) return 'attempts_exceeded';
  if (hashCode(code, pepper) !== item.codeHash) {
    // この失敗で試行上限に達する場合は失効扱いにして再送を促す
    return item.attempts + 1 >= MAX_ATTEMPTS ? 'attempts_exceeded' : 'invalid';
  }
  return 'ok';
}

// 再送レート制限の判定（純粋関数）
export function canResend(
  item: Pick<StoredCode, 'lastSentAt'> | undefined,
  nowMs: number,
): boolean {
  if (!item) return true;
  return nowMs - item.lastSentAt >= RESEND_INTERVAL_SECONDS * 1000;
}

// 認証コードメールの件名・本文を用途別に組み立てる（純粋関数）。
// 用途を明記するのは、第三者が他人のメールアドレスでリセットを要求した場合に
// 本人が「身に覚えのない操作」だと気づけるようにするため。
// あわせて「まだ変更されていない」ことを伝えて不安を与えないようにする。
export function verificationEmailContent(
  purpose: VerificationPurpose,
  code: string,
): { subject: string; body: string } {
  const isRegister = purpose === 'register';
  const minutes = Math.floor(CODE_TTL_SECONDS / 60);

  return {
    subject: isRegister
      ? '【FlexQ】新規登録の認証コード'
      : '【FlexQ】パスワードリセットの認証コード',
    body: [
      isRegister
        ? 'FlexQ の新規登録のお手続きを受け付けました。'
        : 'FlexQ のパスワードリセットのお手続きを受け付けました。',
      'アプリの画面に戻り、以下の 6 桁の認証コードを入力してください。',
      '',
      `認証コード: ${code}`,
      '',
      `有効期限は ${minutes} 分です。期限が切れた場合は、アプリの`,
      '「認証コードを再送する」から新しいコードを受け取れます。',
      '',
      'このメールに心当たりがない場合は、コードを誰にも教えず破棄してください。',
      isRegister
        ? 'アカウントはまだ作成されていません。'
        : 'お客様のパスワードはまだ変更されていません。',
      '',
      'FlexQ チーム',
    ].join('\n'),
  };
}
