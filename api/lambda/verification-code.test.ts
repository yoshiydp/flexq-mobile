/**
 * verification-code.ts（メール認証コードの純粋ロジック）のユニットテスト (TASK-85)
 */
import {
  CODE_TTL_SECONDS,
  MAX_ATTEMPTS,
  RESEND_INTERVAL_SECONDS,
  canResend,
  evaluateCode,
  generateCode,
  hashCode,
  verificationEmailContent,
} from './verification-code';

const NOW_MS = 1_700_000_000_000;
const PEPPER = 'test-pepper';

function storedCode(code: string, overrides: Partial<{ expiresAt: number; attempts: number }> = {}) {
  return {
    codeHash: hashCode(code, PEPPER),
    expiresAt: Math.floor(NOW_MS / 1000) + CODE_TTL_SECONDS,
    attempts: 0,
    ...overrides,
  };
}

describe('generateCode', () => {
  it('常に 6 桁の数字文字列を返す（先頭ゼロも保持）', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });
});

describe('hashCode', () => {
  it('同じコード + 同じペッパーは同じハッシュ・異なるコードは異なるハッシュになる', () => {
    expect(hashCode('123456', PEPPER)).toBe(hashCode('123456', PEPPER));
    expect(hashCode('123456', PEPPER)).not.toBe(hashCode('123457', PEPPER));
  });

  it('ペッパーが違えばハッシュも変わる（テーブル読み取りだけでは総当たり不可）', () => {
    expect(hashCode('123456', PEPPER)).not.toBe(hashCode('123456', 'other'));
  });

  it('平文コードがそのまま保存値にならない', () => {
    expect(hashCode('123456', PEPPER)).not.toContain('123456');
  });
});

describe('evaluateCode', () => {
  it('正しいコードは ok', () => {
    expect(evaluateCode(storedCode('123456'), '123456', NOW_MS, PEPPER)).toBe('ok');
  });

  it('未発行（アイテムなし）は expired（再送を促す）', () => {
    expect(evaluateCode(undefined, '123456', NOW_MS, PEPPER)).toBe('expired');
  });

  it('有効期限切れは expired', () => {
    const item = storedCode('123456', { expiresAt: Math.floor(NOW_MS / 1000) - 1 });
    expect(evaluateCode(item, '123456', NOW_MS, PEPPER)).toBe('expired');
  });

  it('期限ちょうど（expiresAt == now）は expired', () => {
    const item = storedCode('123456', { expiresAt: Math.floor(NOW_MS / 1000) });
    expect(evaluateCode(item, '123456', NOW_MS, PEPPER)).toBe('expired');
  });

  it('誤ったコードは invalid', () => {
    expect(evaluateCode(storedCode('123456'), '000000', NOW_MS, PEPPER)).toBe('invalid');
  });

  it('試行上限に達する失敗は attempts_exceeded になる', () => {
    const item = storedCode('123456', { attempts: MAX_ATTEMPTS - 1 });
    expect(evaluateCode(item, '000000', NOW_MS, PEPPER)).toBe('attempts_exceeded');
  });

  it('試行上限超過後は正しいコードでも attempts_exceeded', () => {
    const item = storedCode('123456', { attempts: MAX_ATTEMPTS });
    expect(evaluateCode(item, '123456', NOW_MS, PEPPER)).toBe('attempts_exceeded');
  });

  it('上限直前（attempts = MAX - 2）の失敗はまだ invalid（再入力可能）', () => {
    const item = storedCode('123456', { attempts: MAX_ATTEMPTS - 2 });
    expect(evaluateCode(item, '000000', NOW_MS, PEPPER)).toBe('invalid');
  });
});

describe('verificationEmailContent', () => {
  it('新規登録は用途が件名・本文から分かる', () => {
    const { subject, body } = verificationEmailContent('register', '123456');
    expect(subject).toContain('新規登録');
    expect(body).toContain('新規登録のお手続き');
    expect(body).toContain('アカウントはまだ作成されていません');
  });

  it('パスワードリセットは用途が件名・本文から分かる', () => {
    const { subject, body } = verificationEmailContent('reset', '123456');
    expect(subject).toContain('パスワードリセット');
    expect(body).toContain('パスワードリセットのお手続き');
    // 身に覚えのない受信者を不安にさせないため、まだ変更されていないことを伝える
    expect(body).toContain('パスワードはまだ変更されていません');
  });

  it('用途によって件名・本文が異なる（取り違えを防ぐ）', () => {
    const reg = verificationEmailContent('register', '123456');
    const res = verificationEmailContent('reset', '123456');
    expect(reg.subject).not.toBe(res.subject);
    expect(reg.body).not.toBe(res.body);
  });

  it('コードと有効期限が本文に含まれる', () => {
    const { body } = verificationEmailContent('register', '987654');
    expect(body).toContain('認証コード: 987654');
    expect(body).toContain(`有効期限は ${Math.floor(CODE_TTL_SECONDS / 60)} 分`);
  });

  it('心当たりがない場合の案内が両方の用途に含まれる', () => {
    for (const purpose of ['register', 'reset'] as const) {
      expect(verificationEmailContent(purpose, '123456').body).toContain(
        '心当たりがない場合',
      );
    }
  });
});

describe('canResend', () => {
  it('未発行なら送信できる', () => {
    expect(canResend(undefined, NOW_MS)).toBe(true);
  });

  it('送信直後は再送できない', () => {
    expect(canResend({ lastSentAt: NOW_MS - 1000 }, NOW_MS)).toBe(false);
  });

  it('再送間隔を過ぎたら再送できる', () => {
    const lastSentAt = NOW_MS - RESEND_INTERVAL_SECONDS * 1000;
    expect(canResend({ lastSentAt }, NOW_MS)).toBe(true);
  });
});
