/**
 * memoShareText のユニットテスト (TASK-128)
 *
 * - QUICK MEMO の本文（tentap / tiptap の HTML）を Markdown 記法のプレーンテキストへ変換する
 * - 段落 1 つを 1 行にし、歌詞の改行をそのまま保つ（段落間に空行を足さない）
 * - 書式ツールバーの H1 / H2 / B / I / U / 箇条書き / 番号付きを Markdown に対応させる
 * - 共有テキストは「# タイトル」+ 空行 + 本文。ファイル名はタイトル（空なら日時）+ .txt
 */
import {
  buildMemoShareFileName,
  buildMemoShareText,
  htmlToMemoText,
} from './memoShareText';

describe('htmlToMemoText', () => {
  it('段落 1 つを 1 行にし、段落の間に空行を足さない', () => {
    expect(
      htmlToMemoText('<p>夜明け前の街を</p><p>ひとりで歩いた</p>'),
    ).toBe('夜明け前の街を\nひとりで歩いた');
  });

  it('空の段落は空行として残す（連の区切り）', () => {
    expect(
      htmlToMemoText('<p>1 番の歌詞</p><p></p><p>2 番の歌詞</p>'),
    ).toBe('1 番の歌詞\n\n2 番の歌詞');
  });

  it('<br>（段落内の改行）は改行にする', () => {
    expect(htmlToMemoText('<p>1 行目<br>2 行目<br/>3 行目</p>')).toBe(
      '1 行目\n2 行目\n3 行目',
    );
  });

  it('先頭・末尾の空行と行末の空白は取り除く', () => {
    expect(htmlToMemoText('<p></p><p>本文  </p><p></p><p></p>')).toBe('本文');
  });

  it('見出し H1 / H2 は # / ## にする', () => {
    expect(htmlToMemoText('<h1>Verse</h1><p>歌詞</p><h2>Hook</h2>')).toBe(
      '# Verse\n歌詞\n## Hook',
    );
  });

  it('太字・斜体・下線を Markdown の記号にする（下線は太字に寄せる）', () => {
    expect(
      htmlToMemoText(
        '<p><strong>太字</strong> と <em>斜体</em> と <u>下線</u></p>',
      ),
    ).toBe('**太字** と *斜体* と **下線**');
  });

  it('太字の中の下線で記号が重ならない', () => {
    expect(htmlToMemoText('<p><strong><u>強調</u></strong></p>')).toBe(
      '**強調**',
    );
    expect(htmlToMemoText('<p><u>強調<strong>強く</strong></u></p>')).toBe(
      '**強調強く**',
    );
  });

  it('太字と斜体を重ねると *** になる', () => {
    expect(htmlToMemoText('<p><strong><em>両方</em></strong></p>')).toBe(
      '***両方***',
    );
  });

  it('装飾の内側の前後の空白は記号の外へ出す', () => {
    expect(htmlToMemoText('<p>A<strong> 太字 </strong>B</p>')).toBe(
      'A **太字** B',
    );
  });

  it('空白だけの装飾には記号を付けない', () => {
    expect(htmlToMemoText('<p>A<strong> </strong>B</p>')).toBe('A B');
  });

  it('箇条書きは - 、番号付きは 1. 2. にする（li の中の <p> も 1 行になる）', () => {
    expect(
      htmlToMemoText(
        '<ul><li><p>りんご</p></li><li><p>みかん</p></li></ul>' +
          '<ol><li><p>イントロ</p></li><li><p>サビ</p></li></ol>',
      ),
    ).toBe('- りんご\n- みかん\n1. イントロ\n2. サビ');
  });

  it('番号付きリストの開始番号（start）を引き継ぐ', () => {
    expect(
      htmlToMemoText('<ol start="3"><li><p>三</p></li><li><p>四</p></li></ol>'),
    ).toBe('3. 三\n4. 四');
  });

  it('入れ子のリストはインデントする', () => {
    expect(
      htmlToMemoText(
        '<ul><li><p>親</p><ul><li><p>子</p></li></ul></li><li><p>次</p></li></ul>',
      ),
    ).toBe('- 親\n  - 子\n- 次');
  });

  it('リスト項目の中の改行は項目のインデントで続ける', () => {
    expect(htmlToMemoText('<ol><li><p>1 行目<br>2 行目</p></li></ol>')).toBe(
      '1. 1 行目\n   2 行目',
    );
  });

  it('タスクリストはチェック状態を [x] / [ ] で表す', () => {
    expect(
      htmlToMemoText(
        '<ul data-type="taskList">' +
          '<li data-checked="true" data-type="taskItem"><label><input type="checkbox" checked="checked"><span></span></label><div><p>済み</p></div></li>' +
          '<li data-checked="false" data-type="taskItem"><label><input type="checkbox"><span></span></label><div><p>未</p></div></li>' +
          '</ul>',
      ),
    ).toBe('- [x] 済み\n- [ ] 未');
  });

  it('引用・取り消し線・コード・区切り線も変換する', () => {
    expect(
      htmlToMemoText(
        '<blockquote><p>引用</p></blockquote><p><s>消す</s> <code>a*b</code></p><hr><p>後</p>',
      ),
    ).toBe('> 引用\n~~消す~~ `a*b`\n---\n後');
  });

  it('リンクは [テキスト](URL) にし、URL がそのまま本文なら URL だけにする', () => {
    expect(
      htmlToMemoText(
        '<p><a href="https://example.com/a">デモ</a> <a href="https://example.com">https://example.com</a></p>',
      ),
    ).toBe('[デモ](https://example.com/a) https://example.com');
  });

  it('HTML エンティティをデコードし、二重デコードしない', () => {
    expect(
      htmlToMemoText(
        '<p>Rock&nbsp;&amp;&nbsp;Roll &lt;3 &quot;yeah&quot; it&#39;s &#x2665; &amp;lt;</p>',
      ),
    ).toBe('Rock & Roll <3 "yeah" it\'s ♥ &lt;');
  });

  it('本文中の * や # はエスケープしない', () => {
    expect(htmlToMemoText('<p># ハッシュ *星*</p>')).toBe('# ハッシュ *星*');
  });

  it('HTML 内の改行コードは空白として扱う', () => {
    expect(htmlToMemoText('<p>A\nB</p>\n<p>C</p>')).toBe('A B\nC');
  });

  it('タグを含まない文字列・空文字・空の段落だけの本文', () => {
    expect(htmlToMemoText('プレーン')).toBe('プレーン');
    expect(htmlToMemoText('')).toBe('');
    expect(htmlToMemoText('<p></p>')).toBe('');
  });

  it('閉じ忘れや対応しない終了タグがあっても例外にしない', () => {
    expect(htmlToMemoText('<p><strong>開いたまま</p><p>次</p></em>')).toBe(
      '**開いたまま**\n次',
    );
  });
});

describe('buildMemoShareText', () => {
  it('先頭にタイトルを # で付け、空行を挟んで本文を続ける', () => {
    expect(
      buildMemoShareText('新曲の歌詞', '<p>1 行目</p><p>2 行目</p>'),
    ).toBe('# 新曲の歌詞\n\n1 行目\n2 行目');
  });

  it('タイトルが空なら本文だけ、本文が空ならタイトルだけにする', () => {
    expect(buildMemoShareText('  ', '<p>本文</p>')).toBe('本文');
    expect(buildMemoShareText('タイトル', '<p></p>')).toBe('# タイトル');
  });

  it('両方とも空なら空文字を返す', () => {
    expect(buildMemoShareText('', '<p></p>')).toBe('');
  });

  it('タイトルの前後の空白を除き、内部の連続する空白を 1 つにする', () => {
    expect(buildMemoShareText('  My   Song ', '')).toBe('# My Song');
  });
});

describe('buildMemoShareFileName', () => {
  const now = new Date(2026, 9, 10, 9, 5); // 2026-10-10 09:05（ローカル時刻）

  it('タイトル + .txt にする', () => {
    expect(buildMemoShareFileName('新曲の歌詞', now)).toBe('新曲の歌詞.txt');
  });

  it('ファイル名に使えない文字は _ に置き換える', () => {
    expect(buildMemoShareFileName('A/B:C?', now)).toBe('A_B_C_.txt');
  });

  it('タイトルが空なら日時から memo-YYYYMMDD-HHmm.txt を作る', () => {
    expect(buildMemoShareFileName('   ', now)).toBe('memo-20261010-0905.txt');
  });
});
