import { sanitizeFileBaseName } from '@/utils/buildShareFileName';

/**
 * QUICK MEMO の共有用テキストを組み立てるユーティリティ (TASK-128)。
 *
 * 本文はリッチエディター（tentap / tiptap）の HTML で保存されているため、
 * 共有時に Markdown 記法のプレーンテキストへ変換する。テキスト共有（LINE・iOS メモ・
 * Google Keep）と .txt ファイルの両方で同じ文字列を使う。
 *
 * 変換の方針:
 * - 段落（<p>）1 つを 1 行にする。歌詞は「書いたままの改行」が重要なため、
 *   Markdown のハードブレーク（行末スペース 2 つ / `\`）や段落間の空行は足さない。
 *   空の段落は空行として残す（連の区切り）
 * - 見出し → `#` / `##`、太字 → `**`、斜体 → `*`、箇条書き → `-`、番号付き → `1.`
 * - 下線は Markdown に標準記法が無いため太字（`**`）に寄せる
 * - 本文中の `*` や `#` はエスケープしない（受け取り側の多くはプレーンテキスト表示で、
 *   バックスラッシュがそのまま見えてしまうため）
 */

type ElementNode = {
  type: 'element';
  name: string;
  attrs: Record<string, string>;
  children: HtmlNode[];
};
type TextNode = { type: 'text'; value: string };
type HtmlNode = ElementNode | TextNode;

/** 終了タグを持たない要素 */
const VOID_ELEMENTS = new Set(['br', 'hr', 'img', 'input', 'wbr']);

/** ブロック要素（インライン要素の並びを段落として区切る境界） */
const BLOCK_ELEMENTS = new Set([
  'p',
  'div',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'ul',
  'ol',
  'li',
  'blockquote',
  'pre',
  'hr',
  'table',
  'tr',
]);

const decodeEntities = (text: string): string =>
  text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) =>
      String.fromCodePoint(parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_, dec: string) =>
      String.fromCodePoint(parseInt(dec, 10)),
    )
    // &amp; は最後に処理して二重デコードを防ぐ
    .replace(/&amp;/gi, '&')
    .replace(/ /g, ' ');

const parseAttributes = (source: string): Record<string, string> => {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s=/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    attrs[match[1].toLowerCase()] = decodeEntities(
      match[2] ?? match[3] ?? match[4] ?? '',
    );
  }
  return attrs;
};

/**
 * エディターが出力する HTML を簡易的なツリーに変換する。
 * 閉じ忘れ・対応しない終了タグがあっても例外にせず、可能な範囲で解釈する
 */
const parseHtml = (html: string): HtmlNode[] => {
  const root: ElementNode = {
    type: 'element',
    name: '#root',
    attrs: {},
    children: [],
  };
  const stack: ElementNode[] = [root];
  const tokenPattern =
    /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*?)?)\s*(\/?)>|[^<]+|</g;
  let match: RegExpExecArray | null;

  while ((match = tokenPattern.exec(html)) !== null) {
    const [token, closing, rawName, rawAttrs, selfClosing] = match;
    const current = stack[stack.length - 1];

    if (token.startsWith('<!--')) continue;

    if (rawName === undefined) {
      current.children.push({ type: 'text', value: token });
      continue;
    }

    const name = rawName.toLowerCase();
    if (closing) {
      const index = stack.map((node) => node.name).lastIndexOf(name);
      if (index > 0) stack.length = index;
      continue;
    }

    const element: ElementNode = {
      type: 'element',
      name,
      attrs: parseAttributes(rawAttrs ?? ''),
      children: [],
    };
    current.children.push(element);
    if (!selfClosing && !VOID_ELEMENTS.has(name)) stack.push(element);
  }

  return root.children;
};

const isBlock = (node: HtmlNode): boolean =>
  node.type === 'element' && BLOCK_ELEMENTS.has(node.name);

type InlineMarks = { bold: boolean; italic: boolean; strike: boolean };

/**
 * 装飾記号で囲む。Markdown は記号の内側に空白があると装飾として解釈されないため、
 * 前後の空白は記号の外側に出す。空白だけの場合は記号を付けない
 */
const wrapWith = (content: string, marker: string): string => {
  if (content.trim() === '') return content;
  const leading = content.match(/^\s*/)?.[0] ?? '';
  const trailing = content.match(/\s*$/)?.[0] ?? '';
  return `${leading}${marker}${content.trim()}${marker}${trailing}`;
};

const textContent = (nodes: HtmlNode[]): string =>
  nodes
    .map((node) =>
      node.type === 'text'
        ? decodeEntities(node.value)
        : node.name === 'br'
          ? '\n'
          : textContent(node.children),
    )
    .join('');

const renderInline = (nodes: HtmlNode[], marks: InlineMarks): string =>
  nodes
    .map((node) => {
      if (node.type === 'text') {
        // HTML の改行・タブは表示上の空白なので空白に寄せる（改行は <p> / <br> で表す）
        return decodeEntities(node.value.replace(/[\t\r\n]+/g, ' '));
      }

      switch (node.name) {
        case 'br':
          return '\n';
        case 'strong':
        case 'b':
        case 'u':
          // 下線は Markdown に標準記法が無いため太字に寄せる。
          // 太字の中の下線（またはその逆）で `****` が重ならないよう、太字の内側では記号を付けない
          return marks.bold
            ? renderInline(node.children, marks)
            : wrapWith(
                renderInline(node.children, { ...marks, bold: true }),
                '**',
              );
        case 'em':
        case 'i':
          return marks.italic
            ? renderInline(node.children, marks)
            : wrapWith(
                renderInline(node.children, { ...marks, italic: true }),
                '*',
              );
        case 's':
        case 'del':
        case 'strike':
          return marks.strike
            ? renderInline(node.children, marks)
            : wrapWith(
                renderInline(node.children, { ...marks, strike: true }),
                '~~',
              );
        case 'code':
          return wrapWith(textContent(node.children), '`');
        case 'a': {
          const label = renderInline(node.children, marks);
          const href = node.attrs.href ?? '';
          return href && href !== label.trim() ? `[${label}](${href})` : label;
        }
        case 'img':
          return node.attrs.alt ?? '';
        default:
          return renderInline(node.children, marks);
      }
    })
    .join('');

const NO_MARKS: InlineMarks = { bold: false, italic: false, strike: false };

/** インライン要素の並び（段落 1 つ分）を行の配列にする。<br> は改行として扱う */
const inlineToLines = (nodes: HtmlNode[]): string[] =>
  renderInline(nodes, NO_MARKS).split('\n');

const prefixLines = (
  lines: string[],
  firstPrefix: string,
  restPrefix: string,
): string[] =>
  lines.map((line, index) => `${index === 0 ? firstPrefix : restPrefix}${line}`);

const renderList = (list: ElementNode): string[] => {
  const isOrdered = list.name === 'ol';
  const isTaskList = list.attrs['data-type'] === 'taskList';
  let number = isOrdered ? parseInt(list.attrs.start ?? '1', 10) || 1 : 0;

  return list.children.flatMap((child) => {
    if (child.type !== 'element' || child.name !== 'li') {
      // リスト直下の空白テキストなどは無視する
      return [];
    }
    let marker = '-';
    if (isOrdered) {
      marker = `${number}.`;
      number += 1;
    } else if (isTaskList) {
      marker = child.attrs['data-checked'] === 'true' ? '- [x]' : '- [ ]';
    }
    const itemLines = renderBlocks(child.children);
    const lines = itemLines.length > 0 ? itemLines : [''];
    return prefixLines(lines, `${marker} `, ' '.repeat(marker.length + 1));
  });
};

/** ブロック要素の並びを行の配列にする */
function renderBlocks(nodes: HtmlNode[]): string[] {
  const lines: string[] = [];
  let inlineRun: HtmlNode[] = [];

  const flushInline = () => {
    // ブロック間の空白や、チェックボックスの <label> のように文字を持たない
    // インライン要素だけの並びは行にしない
    const rendered = inlineToLines(inlineRun);
    if (rendered.join('').trim() !== '') lines.push(...rendered);
    inlineRun = [];
  };

  for (const node of nodes) {
    if (!isBlock(node)) {
      inlineRun.push(node);
      continue;
    }
    flushInline();
    const element = node as ElementNode;

    switch (element.name) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6': {
        const level = Number(element.name.slice(1));
        const text = renderInline(element.children, NO_MARKS)
          .replace(/\n/g, ' ')
          .trim();
        lines.push(text ? `${'#'.repeat(level)} ${text}` : '');
        break;
      }
      case 'ul':
      case 'ol':
        lines.push(...renderList(element));
        break;
      case 'li':
        // ul / ol の外に単独で現れた li は箇条書きとして扱う
        lines.push(...prefixLines(renderBlocks(element.children), '- ', '  '));
        break;
      case 'blockquote':
        lines.push(
          ...renderBlocks(element.children).map((line) =>
            line ? `> ${line}` : '>',
          ),
        );
        break;
      case 'pre':
        lines.push(
          '```',
          ...textContent(element.children).replace(/\n$/, '').split('\n'),
          '```',
        );
        break;
      case 'hr':
        lines.push('---');
        break;
      default: {
        // p / div など。中にブロック要素を含む場合はブロックとして展開する
        if (element.children.some(isBlock)) {
          lines.push(...renderBlocks(element.children));
        } else {
          lines.push(...inlineToLines(element.children));
        }
      }
    }
  }
  flushInline();
  return lines;
}

/**
 * メモ本文の HTML を Markdown 記法のプレーンテキストに変換する。
 * 各行の末尾の空白と、先頭・末尾の空行は取り除く（行の途中の空行は連の区切りとして残す）
 */
export const htmlToMemoText = (html: string): string => {
  const lines = renderBlocks(parseHtml(html)).map((line) => line.trimEnd());
  while (lines.length > 0 && lines[0] === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines.join('\n');
};

/**
 * 共有用のテキストを組み立てる。先頭にタイトルを `# タイトル` で付け、空行を挟んで本文を続ける。
 * タイトルと本文がどちらも空の場合は空文字を返す（共有する内容が無い）
 */
export const buildMemoShareText = (title: string, bodyHtml: string): string => {
  const heading = title.replace(/\s+/g, ' ').trim();
  const body = htmlToMemoText(bodyHtml);
  return [heading ? `# ${heading}` : '', body]
    .filter((part) => part !== '')
    .join('\n\n');
};

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * .txt として共有・保存するときのファイル名を返す。
 * タイトルが空（またはファイル名に使える文字が残らない）場合は作成日時から
 * `memo-YYYYMMDD-HHmm.txt` を作る
 */
export const buildMemoShareFileName = (
  title: string,
  now: Date = new Date(),
): string => {
  const baseName =
    sanitizeFileBaseName(title) ||
    `memo-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${baseName}.txt`;
};
