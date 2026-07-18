/**
 * buildShareFileName のユニットテスト (TASK-45)
 * タイトルと音源 URI から共有シートに渡すファイル名を組み立てるロジックを検証する。
 */
import { buildShareFileName } from './buildShareFileName';

describe('buildShareFileName', () => {
  it('タイトルとローカルファイルの拡張子からファイル名を組み立てる', () => {
    expect(
      buildShareFileName('My Take', 'file:///var/mobile/recording-abc.m4a'),
    ).toBe('My Take.m4a');
  });

  it('S3 Presigned URL はクエリ文字列を除いたパスから拡張子を判定する', () => {
    expect(
      buildShareFileName(
        'Chorus',
        'https://bucket.s3.amazonaws.com/records/separated/abc.wav?X-Amz-Signature=xxx&X-Amz-Expires=900',
      ),
    ).toBe('Chorus.wav');
  });

  it('拡張子が判定できない URI は m4a にフォールバックする', () => {
    expect(
      buildShareFileName('Take 1', 'https://s3.example.com/records/abc'),
    ).toBe('Take 1.m4a');
  });

  it('ファイル名に使えない文字はアンダースコアに置換する', () => {
    expect(
      buildShareFileName('a/b\\c:d*e?f"g<h>i|j', 'file:///tmp/rec.m4a'),
    ).toBe('a_b_c_d_e_f_g_h_i_j.m4a');
  });

  it('空のタイトルは既定名 recording にフォールバックする', () => {
    expect(buildShareFileName('', 'file:///tmp/rec.m4a')).toBe('recording.m4a');
    expect(buildShareFileName('   ', 'file:///tmp/rec.m4a')).toBe(
      'recording.m4a',
    );
  });

  it('日本語タイトルはそのまま使える', () => {
    expect(buildShareFileName('サビ 仮歌', 'file:///tmp/rec.m4a')).toBe(
      'サビ 仮歌.m4a',
    );
  });

  it('長すぎるタイトルは 60 文字に切り詰める', () => {
    const longTitle = 'a'.repeat(100);
    expect(buildShareFileName(longTitle, 'file:///tmp/rec.m4a')).toBe(
      `${'a'.repeat(60)}.m4a`,
    );
  });
});
