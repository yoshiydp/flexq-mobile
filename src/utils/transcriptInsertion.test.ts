import {
  appendTranscriptToHtml,
  buildTranscriptInsertScript,
  htmlIncludesTranscript,
  insertTranscript,
  type TranscriptEditorBridge,
} from './transcriptInsertion';

describe('buildTranscriptInsertScript (TASK-91)', () => {
  it('WebView 内の ProseMirror から TipTap エディターを辿って追記する', () => {
    const script = buildTranscriptInsertScript('こんにちは');
    expect(script).toContain("document.querySelector('.ProseMirror')");
    expect(script).toContain('dom.editor');
    expect(script).toContain('editor.commands.insertContent');
    // 本文全体の置き換え（setContent）は使わない
    expect(script).not.toContain('setContent');
  });

  it('フォーカスが無いときだけ末尾へフォーカスする', () => {
    const script = buildTranscriptInsertScript('あ');
    expect(script).toContain("if (!editor.isFocused) editor.commands.focus('end')");
  });

  it('挿入テキストは JSON で埋め込みスクリプトを壊さない', () => {
    const script = buildTranscriptInsertScript('a\'"`);alert(1);//');
    expect(script).toContain(JSON.stringify('a\'"`);alert(1);//'));
  });

  it('前後の空白を落として埋め込む', () => {
    expect(buildTranscriptInsertScript('  あいう  ')).toContain(
      `var text = ${JSON.stringify('あいう')};`,
    );
  });

  it('injectJavaScript 用に true; で終わる', () => {
    expect(buildTranscriptInsertScript('あ').trimEnd().endsWith('true;')).toBe(true);
  });
});

describe('htmlIncludesTranscript (TASK-91)', () => {
  it('タグを跨いでいても本文に含まれていれば true', () => {
    expect(htmlIncludesTranscript('<p>前<strong>こんにちは</strong></p>', 'こんにちは')).toBe(
      true,
    );
  });

  it('含まれていなければ false', () => {
    expect(htmlIncludesTranscript('<p>前</p>', 'こんにちは')).toBe(false);
  });

  it('エスケープされた文字をデコードして比較する', () => {
    expect(htmlIncludesTranscript('<p>a &amp; b</p>', 'a & b')).toBe(true);
  });

  it('空文字は常に true（何もしていないので確認不要）', () => {
    expect(htmlIncludesTranscript('<p></p>', '  ')).toBe(true);
  });
});

describe('appendTranscriptToHtml (フォールバック用・TASK-91)', () => {
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

  it('既存の書式タグを壊さない', () => {
    expect(appendTranscriptToHtml('<p><strong>太字</strong></p>', '追記')).toBe(
      '<p><strong>太字</strong>追記</p>',
    );
  });
});

describe('insertTranscript (TASK-91)', () => {
  const createEditor = (html: string | Promise<string>) => {
    const editor: TranscriptEditorBridge & {
      injectJS: jest.Mock;
      getHTML: jest.Mock;
      setContent: jest.Mock;
      focus: jest.Mock;
    } = {
      injectJS: jest.fn(),
      getHTML: jest.fn(() => Promise.resolve(html)) as jest.Mock,
      setContent: jest.fn(),
      focus: jest.fn(),
    };
    return editor;
  };

  const options = { verifyDelayMs: 0, verifyTimeoutMs: 50 };

  it('空の認識結果では何もしない', async () => {
    const editor = createEditor('<p></p>');
    await expect(insertTranscript(editor, '   ', options)).resolves.toBe('skipped');
    expect(editor.injectJS).not.toHaveBeenCalled();
  });

  it('WebView 内で追記できていれば HTML を差し替えない', async () => {
    const editor = createEditor('<p>手入力ぶんこんにちは</p>');
    await expect(insertTranscript(editor, 'こんにちは', options)).resolves.toBe('inserted');

    expect(editor.injectJS).toHaveBeenCalledTimes(1);
    expect(editor.setContent).not.toHaveBeenCalled();
  });

  it('追記されていなければ、取得したての HTML に追記して差し替える', async () => {
    // 認識中にユーザーが編集した結果（ミラーではなく最新の HTML）
    const editor = createEditor('<p>認識中に打った文字</p>');
    await expect(insertTranscript(editor, 'こんにちは', options)).resolves.toBe('fallback');

    expect(editor.setContent).toHaveBeenCalledWith('<p>認識中に打った文字こんにちは</p>');
    expect(editor.focus).toHaveBeenCalledWith('end');
  });

  it('HTML を取得できない（応答なし）ときは二重挿入を避けて何もしない', async () => {
    const editor = createEditor(new Promise<string>(() => {}));
    await expect(insertTranscript(editor, 'こんにちは', options)).resolves.toBe('unverified');

    expect(editor.injectJS).toHaveBeenCalledTimes(1);
    expect(editor.setContent).not.toHaveBeenCalled();
  });

  it('getHTML が失敗しても例外を投げず、差し替えもしない', async () => {
    const editor = createEditor('<p></p>');
    editor.getHTML.mockRejectedValueOnce(new Error('webview gone'));

    await expect(insertTranscript(editor, 'こんにちは', options)).resolves.toBe('unverified');
    expect(editor.setContent).not.toHaveBeenCalled();
  });

  it('getHTML が同期例外を投げても落ちない', async () => {
    const editor = createEditor('<p></p>');
    editor.getHTML.mockImplementationOnce(() => {
      throw new Error('not ready');
    });

    await expect(insertTranscript(editor, 'こんにちは', options)).resolves.toBe('unverified');
    expect(editor.setContent).not.toHaveBeenCalled();
  });
});
