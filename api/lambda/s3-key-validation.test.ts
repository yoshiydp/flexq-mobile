/**
 * s3-key-validation.ts（S3 キー所有者検証の純粋ロジック）のユニットテスト (TASK-102)
 */
import { isOwnedS3Key, ownedS3Prefix } from './s3-key-validation';

const USER = 'user-1';
const OTHER = 'user-2';

describe('ownedS3Prefix', () => {
  it('カテゴリと userId から "/" 終端のプレフィックスを組み立てる', () => {
    expect(ownedS3Prefix('tracks', USER)).toBe('tracks/user-1/');
    expect(ownedS3Prefix('artworks', USER)).toBe('artworks/user-1/');
    expect(ownedS3Prefix('waveforms', USER)).toBe('waveforms/user-1/');
    expect(ownedS3Prefix('records', USER)).toBe('records/user-1/');
    expect(ownedS3Prefix('profiles', USER)).toBe('profiles/user-1/');
  });
});

describe('isOwnedS3Key', () => {
  it('自ユーザーの正しいプレフィックスのキーを許可する', () => {
    expect(isOwnedS3Key('tracks/user-1/uuid.mp3', USER, ['tracks'])).toBe(true);
    expect(isOwnedS3Key('artworks/user-1/uuid.jpg', USER, ['artworks'])).toBe(true);
    expect(isOwnedS3Key('waveforms/user-1/uuid.json', USER, ['waveforms'])).toBe(true);
    expect(isOwnedS3Key('records/user-1/uuid.m4a', USER, ['records'])).toBe(true);
  });

  it('許可カテゴリを複数指定した場合はいずれかに一致すれば許可する', () => {
    // プロフィール画像は現行 artworks/ 配下、旧データは profiles/ 配下
    const categories = ['artworks', 'profiles'] as const;
    expect(isOwnedS3Key('artworks/user-1/uuid.jpg', USER, categories)).toBe(true);
    expect(isOwnedS3Key('profiles/user-1/uuid.jpg', USER, categories)).toBe(true);
    expect(isOwnedS3Key('tracks/user-1/uuid.mp3', USER, categories)).toBe(false);
  });

  it('他ユーザー ID のプレフィックスを拒否する', () => {
    expect(isOwnedS3Key('artworks/user-2/uuid.jpg', USER, ['artworks'])).toBe(false);
    expect(isOwnedS3Key(`records/${OTHER}/uuid.m4a`, USER, ['records'])).toBe(false);
  });

  it('userId が前方一致するだけの他ユーザーを拒否する（"user-1" と "user-10"）', () => {
    expect(isOwnedS3Key('artworks/user-10/uuid.jpg', USER, ['artworks'])).toBe(false);
  });

  it('カテゴリ（プレフィックス）違いを拒否する', () => {
    // 例: thumbnailKey に records/ のキーを渡す
    expect(isOwnedS3Key('records/user-1/uuid.m4a', USER, ['artworks', 'profiles'])).toBe(false);
    expect(isOwnedS3Key('artworks/user-1/uuid.jpg', USER, ['tracks'])).toBe(false);
    // サーバー側で生成する records/mixed/・records/separated/ もクライアントからは受け付けない
    expect(isOwnedS3Key('records/mixed/user-1/uuid.m4a', USER, ['records'])).toBe(false);
    expect(isOwnedS3Key('records/separated/user-1/uuid.wav', USER, ['records'])).toBe(false);
  });

  it('".." セグメントを含むキーを拒否する（パストラバーサル対策）', () => {
    expect(isOwnedS3Key('artworks/user-1/../user-2/uuid.jpg', USER, ['artworks'])).toBe(false);
    expect(isOwnedS3Key('artworks/user-1/sub/../../user-2/uuid.jpg', USER, ['artworks'])).toBe(
      false,
    );
    // ".." を含まないファイル名（拡張子の前のドット等）は誤検知しない
    expect(isOwnedS3Key('artworks/user-1/my..photo.jpg', USER, ['artworks'])).toBe(true);
  });

  it('"." セグメント・空セグメントを含むキーを拒否する', () => {
    expect(isOwnedS3Key('artworks/user-1/./uuid.jpg', USER, ['artworks'])).toBe(false);
    expect(isOwnedS3Key('artworks/user-1//uuid.jpg', USER, ['artworks'])).toBe(false);
    expect(isOwnedS3Key('/artworks/user-1/uuid.jpg', USER, ['artworks'])).toBe(false);
  });

  it('プレフィックス直後が空のキーを拒否する', () => {
    expect(isOwnedS3Key('artworks/user-1/', USER, ['artworks'])).toBe(false);
    expect(isOwnedS3Key('artworks/user-1', USER, ['artworks'])).toBe(false);
    expect(isOwnedS3Key('records/user-1/', USER, ['records'])).toBe(false);
  });

  it('文字列以外・空文字列を拒否する', () => {
    expect(isOwnedS3Key(undefined, USER, ['artworks'])).toBe(false);
    expect(isOwnedS3Key(null, USER, ['artworks'])).toBe(false);
    expect(isOwnedS3Key('', USER, ['artworks'])).toBe(false);
    expect(isOwnedS3Key(123, USER, ['artworks'])).toBe(false);
    expect(isOwnedS3Key({ key: 'artworks/user-1/uuid.jpg' }, USER, ['artworks'])).toBe(false);
  });

  it('userId が空の場合はすべて拒否する', () => {
    expect(isOwnedS3Key('artworks//uuid.jpg', '', ['artworks'])).toBe(false);
  });

  it('許可カテゴリが空なら拒否する', () => {
    expect(isOwnedS3Key('artworks/user-1/uuid.jpg', USER, [])).toBe(false);
  });
});
