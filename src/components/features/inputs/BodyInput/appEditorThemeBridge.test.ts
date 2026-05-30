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
});
