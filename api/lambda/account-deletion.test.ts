/**
 * account-deletion.ts（アカウント削除の純粋ロジック）のユニットテスト (TASK-80)
 */
import { chunkForBatchWrite, userS3Prefixes } from './account-deletion';

describe('userS3Prefixes', () => {
  it('ユーザーに紐づく全プレフィックスを返す', () => {
    const prefixes = userS3Prefixes('user-1');
    expect(prefixes).toEqual([
      'tracks/user-1/',
      'artworks/user-1/',
      'waveforms/user-1/',
      'records/user-1/',
      'records/mixed/user-1/',
      'records/separated/user-1/',
      'profiles/user-1/',
    ]);
  });

  it('全プレフィックスが userId 区切りで終端している（他ユーザーを巻き込まない）', () => {
    // 例: userId "user-1" のプレフィックスが "user-12" のオブジェクトに
    // 前方一致しないよう、必ず "/" で終わること
    for (const prefix of userS3Prefixes('user-1')) {
      expect(prefix.endsWith('user-1/')).toBe(true);
    }
  });
});

describe('chunkForBatchWrite', () => {
  it('空配列は空のチャンク一覧を返す', () => {
    expect(chunkForBatchWrite([])).toEqual([]);
  });

  it('25 件以下はそのまま 1 チャンクになる', () => {
    const items = Array.from({ length: 25 }, (_, i) => i);
    const chunks = chunkForBatchWrite(items);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(25);
  });

  it('BatchWrite の 25 件制限で分割される', () => {
    const items = Array.from({ length: 60 }, (_, i) => i);
    const chunks = chunkForBatchWrite(items);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(25);
    expect(chunks[1]).toHaveLength(25);
    expect(chunks[2]).toHaveLength(10);
    // 順序・内容が保持されること
    expect(chunks.flat()).toEqual(items);
  });
});
