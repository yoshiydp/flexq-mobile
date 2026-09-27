import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { docClient } from './db';
import { sendEmail } from './ses';
import { createResponse } from './utils';
import {
  CODE_TTL_SECONDS,
  RESEND_INTERVAL_SECONDS,
  alreadyRegisteredEmailContent,
  canResend,
  generateCode,
  verificationEmailContent,
} from './verification-code';
import {
  getStoredCode,
  rollbackStoredCode,
  storeCode,
} from './verification-code-store';

// 6 桁認証コードの発行・メール送信 (TASK-85)
// purpose:
//   - register: 新規登録のメール検証
//   - reset:    パスワードリセットの本人確認
//
// アカウント列挙対策 (TASK-104):
//   登録の有無で応答を変えない（登録済み register も未登録 reset も通常と同じ 200 を返す）。
//   以前は register + 登録済み = 409 / reset + 未登録 = 404 を返していたため、
//   このエンドポイントに任意のメールアドレスを投げるだけで登録済みかどうかを判別できた。
//   - register + 登録済み: 認証コードの代わりに「登録済みです」の案内メールを本人に送る
//     （本人はログイン／リセットへ進める。第三者にはメールが届かないので何も分からない）
//   - reset + 未登録:      メールは送らない（送り先のアカウントが存在しない）
//   どちらの場合も再送制限の行（storeCode）は通常どおり作成する。分岐によって
//   DynamoDB の書き込み有無や 429 の出方が変わると、応答時間や 2 回目の応答コードから
//   登録の有無を推定できてしまうため。行は TTL（expiresAt）で自動削除される。
//   ※ SES 送信の有無による応答時間の差は残るが、ネットワーク揺らぎに埋もれる程度と判断
export const handler = async (event: any) => {
  const body = JSON.parse(event.body || '{}');
  const { email, purpose } = body;

  if (!email || (purpose !== 'register' && purpose !== 'reset')) {
    return createResponse(
      { message: 'Email and purpose (register | reset) are required' },
      400,
    );
  }

  // SES 未設定のまま黙って成功を返すとユーザーがコード入力で詰むため明示的に落とす
  if (!process.env.SENDER_EMAIL) {
    return createResponse(
      { message: 'Verification email is not configured' },
      503,
    );
  }

  const existing = await docClient.send(
    new QueryCommand({
      TableName: process.env.USERS_TABLE!,
      IndexName: 'email-index',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': email },
    }),
  );
  const userExists = !!existing.Items?.length;

  const now = Date.now();
  const stored = await getStoredCode(email, purpose);
  if (!canResend(stored, now)) {
    return createResponse(
      {
        message: 'Please wait before requesting a new code',
        resendIn: RESEND_INTERVAL_SECONDS,
      },
      429,
    );
  }

  // 先に条件付き Put でスロットを予約してからメールを送る。
  // 送信後に保存する方式だと同時リクエストが両方 canResend を通過して
  // 60 秒 1 通の制限をすり抜けるため（Codex レビュー指摘）。
  // 登録済み register / 未登録 reset でも同じ行を作る（コードはメールに載せないので
  // 誰も使えず、行は再送制限のタイマーとしてだけ働く）
  const code = generateCode();
  const reserved = await storeCode(email, purpose, code, now);
  if (!reserved) {
    return createResponse(
      {
        message: 'Please wait before requesting a new code',
        resendIn: RESEND_INTERVAL_SECONDS,
      },
      429,
    );
  }

  const shouldSendCode =
    purpose === 'register' ? !userExists : userExists;
  const notifyAlreadyRegistered = purpose === 'register' && userExists;

  try {
    if (shouldSendCode) {
      const { subject, body } = verificationEmailContent(purpose, code);
      await sendEmail({ to: email, subject, body });
    } else if (notifyAlreadyRegistered) {
      const { subject, body } = alreadyRegisteredEmailContent();
      await sendEmail({ to: email, subject, body });
    }
    // reset + 未登録: 送り先のアカウントが無いのでメールは送らない
  } catch (err) {
    // 予約した行を巻き戻し、ユーザーが再送間隔を待たずに再試行できるようにする
    console.error('Verification email failed to send:', err);
    await rollbackStoredCode(email, purpose, stored);
    return createResponse(
      { message: 'Failed to send verification email' },
      502,
    );
  }

  return createResponse({
    message: 'Verification code sent',
    expiresIn: CODE_TTL_SECONDS,
    resendIn: RESEND_INTERVAL_SECONDS,
  });
};
