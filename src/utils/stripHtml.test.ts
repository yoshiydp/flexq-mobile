import { stripHtml } from './stripHtml';

describe('stripHtml', () => {
  it('通常のタグを取り除く', () => {
    expect(stripHtml('<p>テスト</p>')).toBe('テスト');
  });

  it('ネストしたタグを取り除く', () => {
    expect(stripHtml('<p><strong>太字</strong>と<em>斜体</em></p>')).toBe(
      '太字と斜体',
    );
  });

  it('属性付きのタグを取り除く', () => {
    expect(
      stripHtml('<p class="note" style="color: red;">属性付き</p>'),
    ).toBe('属性付き');
  });

  it('複数の段落は空白 1 つで区切る', () => {
    expect(stripHtml('<p>1行目</p><p>2行目</p>')).toBe('1行目 2行目');
  });

  it('<br> タグは空白 1 つに置き換える', () => {
    expect(stripHtml('<p>1行目<br>2行目<br/>3行目</p>')).toBe(
      '1行目 2行目 3行目',
    );
  });

  it('リスト要素は空白 1 つで区切る', () => {
    expect(stripHtml('<ul><li>りんご</li><li>みかん</li></ul>')).toBe(
      'りんご みかん',
    );
  });

  it('連続する空白は 1 つにまとめる', () => {
    expect(stripHtml('<p>あ</p>  \n  <p>い</p>')).toBe('あ い');
  });

  it('前後の空白は削除する', () => {
    expect(stripHtml('  <p> テスト </p>  ')).toBe('テスト');
  });

  it('空文字はそのまま空文字を返す', () => {
    expect(stripHtml('')).toBe('');
  });

  it('タグのみの文字列は空文字を返す', () => {
    expect(stripHtml('<p></p><br>')).toBe('');
  });

  it('タグを含まない文字列はそのまま返す', () => {
    expect(stripHtml('プレーンテキスト')).toBe('プレーンテキスト');
  });

  it('HTML エンティティをデコードする', () => {
    expect(stripHtml('<p>A&nbsp;&amp;&nbsp;B</p>')).toBe('A & B');
    expect(stripHtml('<p>&lt;p&gt; &quot;quoted&quot; &#39;s</p>')).toBe(
      '<p> "quoted" \'s',
    );
  });

  it('二重エスケープされたエンティティを二重デコードしない', () => {
    expect(stripHtml('<p>&amp;lt;p&amp;gt;</p>')).toBe('&lt;p&gt;');
  });
});
