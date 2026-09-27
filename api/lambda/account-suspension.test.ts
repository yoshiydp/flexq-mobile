/**
 * account-suspension.ts（アカウント停止の純粋ロジック）のユニットテスト (TASK-81)
 */
import {
  createTtlCache,
  isSuspendedUser,
  suspendedResponse,
} from './account-suspension';

describe('isSuspendedUser', () => {
  it('status が suspended のユーザーは停止中と判定される', () => {
    expect(isSuspendedUser({ status: 'suspended' })).toBe(true);
  });

  it('status が active のユーザーは停止中ではない', () => {
    expect(isSuspendedUser({ status: 'active' })).toBe(false);
  });

  it('status 未設定の既存ユーザーは active 扱いになる', () => {
    expect(isSuspendedUser({})).toBe(false);
    expect(isSuspendedUser({ status: undefined })).toBe(false);
  });

  it('ユーザーが存在しない場合は停止中ではない（削除済みは別扱い）', () => {
    expect(isSuspendedUser(null)).toBe(false);
    expect(isSuspendedUser(undefined)).toBe(false);
  });

  it('想定外の status 値は active 扱いになる（安全側に倒さず既存動作を維持）', () => {
    expect(isSuspendedUser({ status: 'SUSPENDED' })).toBe(false);
    expect(isSuspendedUser({ status: 1 })).toBe(false);
  });
});

describe('suspendedResponse', () => {
  it('403 と Account suspended メッセージを返す', () => {
    const res = suspendedResponse();
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toEqual({ message: 'Account suspended' });
    expect(res.headers['Content-Type']).toBe('application/json');
  });
});

describe('createTtlCache', () => {
  it('未キャッシュのユーザーは undefined を返す', () => {
    const cache = createTtlCache<boolean>(60_000);
    expect(cache.get('user-1', 0)).toBeUndefined();
  });

  it('set した値を TTL 内は返す（suspended / active の両方）', () => {
    const cache = createTtlCache<boolean>(60_000);
    cache.set('banned', true, 0);
    cache.set('normal', false, 0);
    expect(cache.get('banned', 59_999)).toBe(true);
    expect(cache.get('normal', 59_999)).toBe(false);
  });

  it('TTL を過ぎたエントリは undefined になる（再参照で DB を引き直す）', () => {
    const cache = createTtlCache<boolean>(60_000);
    cache.set('user-1', false, 0);
    expect(cache.get('user-1', 60_000)).toBeUndefined();
  });

  it('set し直すと TTL が更新される', () => {
    const cache = createTtlCache<boolean>(60_000);
    cache.set('user-1', false, 0);
    cache.set('user-1', true, 30_000);
    expect(cache.get('user-1', 89_999)).toBe(true);
  });

  it('ユーザーごとに独立してキャッシュされる', () => {
    const cache = createTtlCache<boolean>(60_000);
    cache.set('user-1', true, 0);
    expect(cache.get('user-2', 0)).toBeUndefined();
  });
});
