import { stripHtml } from './stripHtml';

/**
 * 音声入力で確定したテキストを、リッチテキストエディター（TenTap / TipTap）へ挿入する。
 *
 * TenTap の WebView にはエディターを指すグローバル（`window.editor` など）は無いため、
 * `injectJS('window.editor...')` では何も挿入されない（TASK-91 の不具合の原因）。
 * ただし TipTap は `Editor.createView()` で `view.dom.editor = this` を代入しており、
 * `.ProseMirror` 要素から Editor インスタンスを辿れる。これを使って
 * **WebView 内でアトミックに追記**する（RN 側のミラー state で本文全体を置き換えない）。
 *
 * injectJS には戻り値が無いため、挿入後に最新の HTML を取り直して反映を確認し、
 * 反映されていない場合だけ「取得したての HTML への追記 + 差し替え」へフォールバックする。
 */

/** injectJS 実行から反映確認までの待ち時間（injectJavaScript と postMessage は別経路のため） */
export const TRANSCRIPT_VERIFY_DELAY_MS = 200;
/** 反映確認の getHTML() を待つ上限（WebView 未応答時に固まらないようにする） */
export const TRANSCRIPT_VERIFY_TIMEOUT_MS = 1500;

export type TranscriptEditorBridge = {
  injectJS: (js: string) => void;
  getHTML: () => Promise<string>;
  setContent: (content: string) => void;
  focus: (pos: 'end') => void;
};

export type InsertTranscriptResult =
  /** 空文字などで何もしなかった */
  | 'skipped'
  /** WebView 内でのアトミックな追記に成功した */
  | 'inserted'
  /** アトミックな追記に失敗したので HTML 差し替えで補った */
  | 'fallback'
  /** 反映を確認できなかった（二重挿入を避けるため何もしない） */
  | 'unverified';

/**
 * WebView 内で実行する追記スクリプトを組み立てる。
 * カーソル位置（フォーカスが無ければ末尾）へテキストノードとして挿入するため、
 * 既存の本文・書式・アンドゥ履歴を壊さない。
 */
export function buildTranscriptInsertScript(transcript: string): string {
  const payload = JSON.stringify(transcript.trim());
  return `(function () {
  try {
    var dom = document.querySelector('.ProseMirror');
    var editor = dom && dom.editor;
    if (!editor) return true;
    var text = ${payload};
    if (!text) return true;
    if (!editor.isFocused) editor.commands.focus('end');
    var before = '';
    try {
      var from = editor.state.selection.from;
      if (from > 1) before = editor.state.doc.textBetween(from - 1, from, ' ', ' ');
    } catch (e) {}
    if (/[A-Za-z0-9]$/.test(before) && /^[A-Za-z0-9]/.test(text)) text = ' ' + text;
    editor.commands.insertContent({ type: 'text', text: text });
  } catch (e) {}
  return true;
})();
true;`;
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** 末尾の空段落（`<p></p>` / `<p><br></p>`）を取り除く */
const stripTrailingEmptyParagraphs = (html: string): string =>
  html.replace(/(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/gi, '').trim();

/**
 * 半角英数の直後に半角英数を続ける場合のみ、区切りの半角スペースを入れる。
 * （日本語同士は詰めて連結する）
 */
const needsSpaceSeparator = (before: string, after: string): boolean =>
  /[A-Za-z0-9]$/.test(before) && /^[A-Za-z0-9]/.test(after);

/**
 * フォールバック用。本文 HTML の末尾段落へテキストを追記する。
 * 渡す HTML は必ず「取得したて」のものにすること（ミラー state を使わない）。
 */
export function appendTranscriptToHtml(
  html: string | undefined | null,
  transcript: string,
): string {
  const text = transcript.trim();
  if (!text) return html ?? '';

  const escaped = escapeHtml(text);
  const base = stripTrailingEmptyParagraphs(html ?? '');

  if (!base) return `<p>${escaped}</p>`;

  const trailingParagraph = base.match(/<\/p>\s*$/i);
  if (trailingParagraph) {
    const inner = base.slice(0, base.length - trailingParagraph[0].length);
    const separator = needsSpaceSeparator(inner, escaped) ? ' ' : '';
    return `${inner}${separator}${escaped}</p>`;
  }

  return `${base}<p>${escaped}</p>`;
}

/** 取得した HTML に認識結果が含まれているか（＝挿入が反映されたか）を判定する */
export function htmlIncludesTranscript(html: string, transcript: string): boolean {
  const needle = transcript.trim().replace(/\s+/g, ' ');
  if (!needle) return true;
  return stripHtml(html).includes(needle);
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const withTimeout = async <T>(promise: Promise<T>, ms: number): Promise<T | null> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      }),
    ]);
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
};

/**
 * 認識結果をエディターへ挿入する。
 * 1. WebView 内でアトミックに追記（本命）
 * 2. 反映を最新の HTML で確認
 * 3. 反映されていなければ、その最新 HTML に追記して差し替え（フォールバック）
 */
export async function insertTranscript(
  editor: TranscriptEditorBridge,
  rawTranscript: string,
  options: { verifyDelayMs?: number; verifyTimeoutMs?: number } = {},
): Promise<InsertTranscriptResult> {
  const transcript = rawTranscript.trim();
  if (!transcript) return 'skipped';

  const {
    verifyDelayMs = TRANSCRIPT_VERIFY_DELAY_MS,
    verifyTimeoutMs = TRANSCRIPT_VERIFY_TIMEOUT_MS,
  } = options;

  editor.injectJS(buildTranscriptInsertScript(transcript));

  if (verifyDelayMs > 0) await delay(verifyDelayMs);

  const html = await withTimeout(
    Promise.resolve().then(() => editor.getHTML()),
    verifyTimeoutMs,
  );

  // 取得できなかった場合は二重挿入を避けるため何もしない
  if (typeof html !== 'string') return 'unverified';
  if (htmlIncludesTranscript(html, transcript)) return 'inserted';

  editor.setContent(appendTranscriptToHtml(html, transcript));
  editor.focus('end');
  return 'fallback';
}
