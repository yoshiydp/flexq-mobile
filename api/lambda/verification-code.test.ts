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
} from './verification-code';

const NOW_MS = 1_700_000_000_000;

function storedCode(code: string, overrides: Partial<{ expiresAt: number; attempts: number }> = {}) {
  return {
    codeHash: hashCode(code),
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
  it('同じコードは同じハッシュ・異なるコードは異なるハッシュになる', () => {
    expect(hashCode('123456')).toBe(hashCode('123456'));
    expect(hashCode('123456')).not.toBe(hashCode('123457'));
  });

  it('平文コードがそのまま保存値にならない', () => {
    expect(hashCode('123456')).not.toContain('123456');
  });
});

describe('evaluateCode', () => {
  it('正しいコードは ok', () => {
    expect(evaluateCode(storedCode('123456'), '123456', NOW_MS)).toBe('ok');
  });

  it('未発行（アイテムなし）は expired（再送を促す）', () => {
    expect(evaluateCode(undefined, '123456', NOW_MS)).toBe('expired');
  });

  it('有効期限切れは expired', () => {
    const item = storedCode('123456', { expiresAt: Math.floor(NOW_MS / 1000) - 1 });
    expect(evaluateCode(item, '123456', NOW_MS)).toBe('expired');
  });

  it('期限ちょうど（expiresAt == now）は expired', () => {
    const item = storedCode('123456', { expiresAt: Math.floor(NOW_MS / 1000) });
    expect(evaluateCode(item, '123456', NOW_MS)).toBe('expired');
  });

  it('誤ったコードは invalid', () => {
    expect(evaluateCode(storedCode('123456'), '000000', NOW_MS)).toBe('invalid');
  });

  it('試行上限に達する失敗は attempts_exceeded になる', () => {
    const item = storedCode('123456', { attempts: MAX_ATTEMPTS - 1 });
    expect(evaluateCode(item, '000000', NOW_MS)).toBe('attempts_exceeded');
  });

  it('試行上限超過後は正しいコードでも attempts_exceeded', () => {
    const item = storedCode('123456', { attempts: MAX_ATTEMPTS });
    expect(evaluateCode(item, '123456', NOW_MS)).toBe('attempts_exceeded');
  });

  it('上限直前（attempts = MAX - 2）の失敗はまだ invalid（再入力可能）', () => {
    const item = storedCode('123456', { attempts: MAX_ATTEMPTS - 2 });
    expect(evaluateCode(item, '000000', NOW_MS)).toBe('invalid');
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
