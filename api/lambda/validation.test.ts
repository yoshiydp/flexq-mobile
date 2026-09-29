/**
 * validation.ts（Lambda 共通の入力バリデーション）のユニットテスト (TASK-107)
 */
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  RICH_TEXT_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  USERNAME_MAX_LENGTH,
  findTooLongField,
  isTooLong,
  isValidEmail,
  isValidPassword,
  tooLongMessage,
  withinLength,
} from './validation';

describe('上限値', () => {
  it('クライアントの通常利用で到達しない十分に大きい値になっている', () => {
    expect(USERNAME_MAX_LENGTH).toBeGreaterThanOrEqual(50);
    expect(EMAIL_MAX_LENGTH).toBe(254);
    expect(PASSWORD_MIN_LENGTH).toBe(8);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
    expect(TITLE_MAX_LENGTH).toBeGreaterThanOrEqual(200);
    // DynamoDB の 1 項目 400KB 制限より十分小さい
    expect(RICH_TEXT_MAX_LENGTH).toBeGreaterThanOrEqual(50_000);
    expect(RICH_TEXT_MAX_LENGTH).toBeLessThan(300_000);
  });
});

describe('isTooLong / withinLength', () => {
  it('最大長ちょうどは許可し、1 文字超えると超過と判定する', () => {
    expect(isTooLong('a'.repeat(10), 10)).toBe(false);
    expect(isTooLong('a'.repeat(11), 10)).toBe(true);
    expect(withinLength('a'.repeat(10), 10)).toBe(true);
    expect(withinLength('a'.repeat(11), 10)).toBe(false);
  });

  it('文字列以外は isTooLong では超過扱いにせず、withinLength では不許可にする', () => {
    for (const value of [undefined, null, 123, {}, [], true]) {
      expect(isTooLong(value, 10)).toBe(false);
      expect(withinLength(value, 10)).toBe(false);
    }
  });

  it('空文字は超過ではない', () => {
    expect(isTooLong('', 0)).toBe(false);
    expect(withinLength('', 0)).toBe(true);
  });
});

describe('isValidEmail', () => {
  it('一般的なメールアドレスを許可する', () => {
    expect(isValidEmail('demo@example.com')).toBe(true);
    expect(isValidEmail('e2e-ban@example.com')).toBe(true);
    expect(isValidEmail('first.last+tag@sub.example.co.jp')).toBe(true);
  });

  it('@ やドメインのドットが欠けた文字列・空白入りを拒否する', () => {
    expect(isValidEmail('demo')).toBe(false);
    expect(isValidEmail('demo@')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
    expect(isValidEmail('demo@example')).toBe(false);
    expect(isValidEmail('de mo@example.com')).toBe(false);
    expect(isValidEmail('demo@exa mple.com')).toBe(false);
    expect(isValidEmail('')).toBe(false);
  });

  it('254 文字を超えるアドレスを拒否する', () => {
    const local = 'a'.repeat(EMAIL_MAX_LENGTH - '@example.com'.length);
    expect(isValidEmail(`${local}@example.com`)).toBe(true);
    expect(isValidEmail(`${local}a@example.com`)).toBe(false);
  });

  it('文字列以外を拒否する', () => {
    expect(isValidEmail(undefined)).toBe(false);
    expect(isValidEmail(null)).toBe(false);
    expect(isValidEmail(123)).toBe(false);
    expect(isValidEmail({ email: 'demo@example.com' })).toBe(false);
  });
});

describe('isValidPassword', () => {
  it('8〜128 文字を許可する（既存のテストアカウント password123 を含む）', () => {
    expect(isValidPassword('password123')).toBe(true);
    expect(isValidPassword('a'.repeat(PASSWORD_MIN_LENGTH))).toBe(true);
    expect(isValidPassword('a'.repeat(PASSWORD_MAX_LENGTH))).toBe(true);
  });

  it('7 文字以下・129 文字以上を拒否する', () => {
    expect(isValidPassword('a'.repeat(PASSWORD_MIN_LENGTH - 1))).toBe(false);
    expect(isValidPassword('a'.repeat(PASSWORD_MAX_LENGTH + 1))).toBe(false);
    expect(isValidPassword('')).toBe(false);
  });

  it('文字列以外を拒否する', () => {
    expect(isValidPassword(undefined)).toBe(false);
    expect(isValidPassword(12345678)).toBe(false);
    expect(isValidPassword(null)).toBe(false);
  });
});

describe('findTooLongField / tooLongMessage', () => {
  it('すべて上限内なら null を返す', () => {
    expect(
      findTooLongField([
        ['title', 'ok', 10],
        ['body', undefined, 10],
        ['name', null, 10],
      ]),
    ).toBeNull();
  });

  it('最初に超過したフィールド名を返す', () => {
    expect(
      findTooLongField([
        ['title', 'ok', 10],
        ['body', 'a'.repeat(11), 10],
        ['name', 'a'.repeat(11), 10],
      ]),
    ).toBe('body');
  });

  it('メッセージは "<field> is too long" の形式になる', () => {
    expect(tooLongMessage('title')).toEqual({ message: 'title is too long' });
  });
});
