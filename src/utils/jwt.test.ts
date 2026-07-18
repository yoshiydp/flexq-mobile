import { decodeJwtPayload, isJwtExpired } from './jwt';

// テスト用の JWT を組み立てる（署名は検証しないためダミーで良い）
const buildToken = (payload: Record<string, unknown>): string => {
  const header = Buffer.from(
    JSON.stringify({ alg: 'HS256', typ: 'JWT' }),
  ).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.dummy-signature`;
};

describe('decodeJwtPayload', () => {
  it('ペイロードをデコードして返すこと', () => {
    const token = buildToken({ userId: 'user-1', exp: 1234567890 });

    expect(decodeJwtPayload(token)).toEqual({
      userId: 'user-1',
      exp: 1234567890,
    });
  });

  it('base64url 特有の文字（- / _）を含むペイロードをデコードできること', () => {
    // '~' や '?' を含めるとエンコード結果に - / _ が現れる
    const payload = { sub: '~~~???>>>', exp: 1 };
    const token = buildToken(payload);

    expect(decodeJwtPayload(token)).toEqual(payload);
  });

  it('JWT 形式でない文字列は null を返すこと', () => {
    expect(decodeJwtPayload('not-a-jwt')).toBeNull();
    expect(decodeJwtPayload('a.b')).toBeNull();
    expect(decodeJwtPayload('')).toBeNull();
  });

  it('ペイロードが JSON でない場合は null を返すこと', () => {
    const invalid = Buffer.from('not json').toString('base64url');
    expect(decodeJwtPayload(`header.${invalid}.sig`)).toBeNull();
  });

  it('ペイロードに base64 でない文字が含まれる場合は null を返すこと', () => {
    expect(decodeJwtPayload('header.@@@@.sig')).toBeNull();
  });
});

describe('isJwtExpired', () => {
  const nowMs = 1_700_000_000_000;
  const nowSec = nowMs / 1000;

  it('exp が十分未来なら false を返すこと', () => {
    const token = buildToken({ exp: nowSec + 3600 });
    expect(isJwtExpired(token, nowMs)).toBe(false);
  });

  it('exp が過去なら true を返すこと', () => {
    const token = buildToken({ exp: nowSec - 60 });
    expect(isJwtExpired(token, nowMs)).toBe(true);
  });

  it('exp までの残りがマージン（30 秒）以内なら true を返すこと', () => {
    const token = buildToken({ exp: nowSec + 10 });
    expect(isJwtExpired(token, nowMs)).toBe(true);
  });

  it('exp を持たないトークンは false（サーバー側判定に委ねる）を返すこと', () => {
    const token = buildToken({ userId: 'user-1' });
    expect(isJwtExpired(token, nowMs)).toBe(false);
  });

  it('デコードできないトークンは false を返すこと', () => {
    expect(isJwtExpired('broken-token', nowMs)).toBe(false);
  });
});
