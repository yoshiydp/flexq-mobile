/**
 * auth-tokens.ts（JWT 発行と tokenVersion 照合）のユニットテスト (TASK-105)
 *
 * jsonwebtoken はリポジトリ直下の node_modules に無いため virtual mock で
 * 差し替え、sign に渡された payload / オプションを検証する。
 */
import {
  getClaimedTokenVersion,
  getTokenVersion,
  isTokenVersionRevoked,
  issueTokens,
} from './auth-tokens';

const mockSign = jest.fn();

jest.mock(
  'jsonwebtoken',
  () => ({ sign: (...args: unknown[]) => mockSign(...args) }),
  { virtual: true },
);

describe('getTokenVersion', () => {
  it('数値の tokenVersion をそのまま返す', () => {
    expect(getTokenVersion({ tokenVersion: 3 })).toBe(3);
    expect(getTokenVersion({ tokenVersion: 0 })).toBe(0);
  });

  it('属性なし・ユーザーなし・数値以外は 0 扱い（既存レコード互換）', () => {
    expect(getTokenVersion({})).toBe(0);
    expect(getTokenVersion(null)).toBe(0);
    expect(getTokenVersion(undefined)).toBe(0);
    expect(getTokenVersion({ tokenVersion: '2' })).toBe(0);
    expect(getTokenVersion({ tokenVersion: NaN })).toBe(0);
  });
});

describe('getClaimedTokenVersion', () => {
  it('数値の tv をそのまま返す', () => {
    expect(getClaimedTokenVersion({ tv: 3 })).toBe(3);
    expect(getClaimedTokenVersion({ tv: 0 })).toBe(0);
  });

  it('tv なし・payload なし・数値以外は 0 扱い（旧仕様のトークン互換）', () => {
    expect(getClaimedTokenVersion({})).toBe(0);
    expect(getClaimedTokenVersion(null)).toBe(0);
    expect(getClaimedTokenVersion(undefined)).toBe(0);
    expect(getClaimedTokenVersion({ tv: '2' })).toBe(0);
    expect(getClaimedTokenVersion({ tv: NaN })).toBe(0);
  });
});

describe('isTokenVersionRevoked', () => {
  it('tv とユーザーの tokenVersion が一致すれば失効していない', () => {
    expect(isTokenVersionRevoked({ tv: 2 }, { tokenVersion: 2 })).toBe(false);
  });

  it('tv が保存値より古ければ失効（ログアウト・パスワードリセット後の旧トークン）', () => {
    expect(isTokenVersionRevoked({ tv: 1 }, { tokenVersion: 2 })).toBe(true);
  });

  it('tv が保存値より新しい場合は失効扱いにしない（読み取った保存値が古いだけ）', () => {
    // tv は署名済み JWT の中身なので水増しできず、値を決めるのは発行した
    // サーバーだけ。保存値が小さいのは結果整合の読み取り遅れを意味する
    expect(isTokenVersionRevoked({ tv: 2 }, { tokenVersion: 1 })).toBe(false);
    expect(isTokenVersionRevoked({ tv: 1 }, {})).toBe(false);
  });

  it('tv なしの旧トークンは tokenVersion が 0（属性なし含む）の間だけ有効', () => {
    expect(isTokenVersionRevoked({}, {})).toBe(false);
    expect(isTokenVersionRevoked({}, { tokenVersion: 0 })).toBe(false);
    expect(isTokenVersionRevoked(null, {})).toBe(false);
    expect(isTokenVersionRevoked({}, { tokenVersion: 1 })).toBe(true);
  });
});

describe('issueTokens', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = 'secret';
    mockSign.mockImplementation((payload: any) =>
      payload.type === 'refresh' ? 'signed-refresh' : 'signed-access',
    );
  });

  it('accessToken / refreshToken の両方に現在の tokenVersion を tv として含める', () => {
    const tokens = issueTokens({
      userId: 'user-1',
      email: 'u@example.com',
      tokenVersion: 4,
    });

    expect(tokens).toEqual({
      accessToken: 'signed-access',
      refreshToken: 'signed-refresh',
      expiresIn: 604800,
    });
    expect(mockSign).toHaveBeenCalledTimes(2);
    expect(mockSign).toHaveBeenNthCalledWith(
      1,
      { userId: 'user-1', email: 'u@example.com', tv: 4 },
      'secret',
      { expiresIn: '7d' },
    );
    expect(mockSign).toHaveBeenNthCalledWith(
      2,
      { userId: 'user-1', type: 'refresh', tv: 4 },
      'secret',
      { expiresIn: '30d' },
    );
  });

  it('tokenVersion 属性のない既存ユーザーには tv: 0 を焼き込む', () => {
    issueTokens({ userId: 'user-1', email: 'u@example.com' });

    expect(mockSign.mock.calls[0][0]).toMatchObject({ tv: 0 });
    expect(mockSign.mock.calls[1][0]).toMatchObject({ tv: 0 });
  });

  it('refreshToken には email を含めない（accessToken との区別を維持）', () => {
    issueTokens({ userId: 'user-1', email: 'u@example.com', tokenVersion: 1 });

    expect(mockSign.mock.calls[1][0]).not.toHaveProperty('email');
  });
});
