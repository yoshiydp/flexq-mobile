jest.mock('@10play/tentap-editor', () => ({
  BridgeExtension: class {
    extendCSS: string;
    constructor({ extendCSS }: { extendCSS: string }) {
      this.extendCSS = extendCSS ?? '';
    }
  },
}));

jest.mock('@/globalStyles', () => ({
  COLORS: {
    base: { bgDefault: '#0D0D0D' },
    form: {
      default: { text: '#CCC' },
      placeholder: '#444',
    },
  },
}));

// eslint-disable-next-line import/first
import { AppEditorThemeBridge } from './appEditorThemeBridge';

describe('AppEditorThemeBridge', () => {
  const css: string = (AppEditorThemeBridge as any).extendCSS;

  it('インスタンスが生成される', () => {
    expect(AppEditorThemeBridge).toBeDefined();
  });

  it('背景色 #0D0D0D が含まれる', () => {
    expect(css).toContain('#0D0D0D');
  });

  it('本文テキストカラー #CCC が含まれる', () => {
    expect(css).toContain('#CCC');
  });

  it('ゴシック体フォント (-apple-system) が含まれる', () => {
    expect(css).toContain('-apple-system');
  });

  it('.ProseMirror セレクターが含まれる', () => {
    expect(css).toContain('.ProseMirror');
  });

  it('プレースホルダーカラー #444 が含まれる', () => {
    expect(css).toContain('#444');
  });

  it('プレースホルダーの ::before セレクターが含まれる', () => {
    expect(css).toContain('::before');
  });

  describe('見出しスタイル', () => {
    it('.ProseMirror h1 セレクターが含まれる', () => {
      expect(css).toContain('.ProseMirror h1');
    });

    it('.ProseMirror h2 セレクターが含まれる', () => {
      expect(css).toContain('.ProseMirror h2');
    });

    it('h1 の font-size が 22px である', () => {
      const h1Block = css.match(/\.ProseMirror h1\s*\{([^}]+)\}/)?.[1] ?? '';
      expect(h1Block).toContain('font-size: 22px');
    });

    it('h2 の font-size が 20px である', () => {
      const h2Block = css.match(/\.ProseMirror h2\s*\{([^}]+)\}/)?.[1] ?? '';
      expect(h2Block).toContain('font-size: 20px');
    });

    it('h1 に margin-bottom が設定されている', () => {
      const h1Block = css.match(/\.ProseMirror h1\s*\{([^}]+)\}/)?.[1] ?? '';
      expect(h1Block).toContain('12px');
    });

    it('h2 に margin-bottom が設定されている', () => {
      const h2Block = css.match(/\.ProseMirror h2\s*\{([^}]+)\}/)?.[1] ?? '';
      expect(h2Block).toContain('12px');
    });
  });
});
