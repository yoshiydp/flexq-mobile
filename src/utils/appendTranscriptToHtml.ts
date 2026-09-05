/**
 * 音声入力で確定したテキストを、リッチテキストエディター（TenTap / TipTap）の
 * HTML 本文の末尾へ追記する。
 *
 * TenTap の WebView には `window.editor` のようなグローバルは存在しないため、
 * `injectJS('window.editor.commands.insertContent(...)')` では何も挿入されない（TASK-91）。
 * 代わりに RN 側で HTML を組み立て、公式ブリッジの `editor.setContent()` に渡す。
 */

const escapeHtml = (text: string): string =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** 末尾の空段落（`<p></p>` / `<p><br></p>`）を取り除く */
const stripTrailingEmptyParagraphs = (html: string): string =>
  html.replace(/(?:<p>(?:\s|&nbsp;|<br\s*\/?>)*<\/p>\s*)+$/gi, '').trim();

/**
 * 半角英数の直後に半角英数を続ける場合のみ、区切りの半角スペースを入れる。
 * （日本語同士は詰めて連結する）
 */
const needsSpaceSeparator = (before: string, after: string): boolean =>
  /[A-Za-z0-9]$/.test(before) && /^[A-Za-z0-9]/.test(after);

export function appendTranscriptToHtml(
  html: string | undefined | null,
  transcript: string,
): string {
  const text = transcript.trim();
  if (!text) return html ?? '';

  const escaped = escapeHtml(text);
  const base = stripTrailingEmptyParagraphs(html ?? '');

  if (!base) return `<p>${escaped}</p>`;

  // 末尾が段落なら同じ段落へ続けて追記する（文章が細切れにならないようにする）
  const trailingParagraph = base.match(/<\/p>\s*$/i);
  if (trailingParagraph) {
    const inner = base.slice(0, base.length - trailingParagraph[0].length);
    const separator = needsSpaceSeparator(inner, escaped) ? ' ' : '';
    return `${inner}${separator}${escaped}</p>`;
  }

  return `${base}<p>${escaped}</p>`;
}

export default appendTranscriptToHtml;
