/**
 * リッチテキスト（エディタの HTML）に表示される文字が 1 文字以上あるか。
 * 空のエディタは `<p></p>` や `<p><br></p>` を返すため、タグと空白（&nbsp; を含む）を除いて判定する。
 */
export function hasVisibleText(html: string | null | undefined): boolean {
  if (!html) return false;
  return (
    html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;|&#160;/gi, ' ')
      .trim().length > 0
  );
}
