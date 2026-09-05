import { appendTranscriptToHtml } from './appendTranscriptToHtml';

describe('appendTranscriptToHtml (TASK-91)', () => {
  it('本文が空のときは段落を作って挿入する', () => {
    expect(appendTranscriptToHtml('', 'こんにちは')).toBe('<p>こんにちは</p>');
    expect(appendTranscriptToHtml(undefined, 'こんにちは')).toBe('<p>こんにちは</p>');
    expect(appendTranscriptToHtml(null, 'こんにちは')).toBe('<p>こんにちは</p>');
  });

  it('空段落しかないときも段落を作り直す', () => {
    expect(appendTranscriptToHtml('<p></p>', 'テスト')).toBe('<p>テスト</p>');
    expect(appendTranscriptToHtml('<p><br></p>', 'テスト')).toBe('<p>テスト</p>');
  });

  it('既存の最終段落に続けて追記する', () => {
    expect(appendTranscriptToHtml('<p>今日は</p>', 'いい天気です')).toBe(
      '<p>今日はいい天気です</p>',
    );
  });

  it('末尾の空段落を取り除いてから追記する', () => {
    expect(appendTranscriptToHtml('<p>歌詞</p><p></p>', 'メモ')).toBe('<p>歌詞メモ</p>');
  });

  it('段落以外のブロックで終わる場合は新しい段落を追加する', () => {
    expect(appendTranscriptToHtml('<h1>タイトル</h1>', '本文')).toBe(
      '<h1>タイトル</h1><p>本文</p>',
    );
  });

  it('半角英数どうしの連結では区切りの半角スペースを入れる', () => {
    expect(appendTranscriptToHtml('<p>hello</p>', 'world')).toBe('<p>hello world</p>');
  });

  it('日本語どうしは詰めて連結する', () => {
    expect(appendTranscriptToHtml('<p>あいう</p>', 'えお')).toBe('<p>あいうえお</p>');
  });

  it('HTML 特殊文字をエスケープする', () => {
    expect(appendTranscriptToHtml('', '<script>a & b</script>')).toBe(
      '<p>&lt;script&gt;a &amp; b&lt;/script&gt;</p>',
    );
  });

  it('空文字・空白のみの認識結果は本文を変更しない', () => {
    expect(appendTranscriptToHtml('<p>既存</p>', '   ')).toBe('<p>既存</p>');
  });

  it('前後の空白を除いて追記する（iOS が付与する先頭スペース対策）', () => {
    expect(appendTranscriptToHtml('<p>あ</p>', '  いう  ')).toBe('<p>あいう</p>');
  });

  it('既存の書式タグを壊さない', () => {
    expect(appendTranscriptToHtml('<p><strong>太字</strong></p>', '追記')).toBe(
      '<p><strong>太字</strong>追記</p>',
    );
  });
});
