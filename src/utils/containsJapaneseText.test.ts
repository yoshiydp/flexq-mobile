import { containsJapaneseText } from './containsJapaneseText';

describe('containsJapaneseText', () => {
  it.each([
    ['ひらがな', 'あとで'],
    ['カタカナ混在', 'レビューする'],
    ['漢字', '削除'],
    ['全角記号', '？'],
    ['英語と日本語の混在', 'OK です'],
  ])('%s を含む場合は true を返す', (_name, text) => {
    expect(containsJapaneseText(text)).toBe(true);
  });

  it.each([
    ['英大文字', 'CANCEL'],
    ['英数字', 'OK2'],
    ['半角記号', 'SAVE!'],
    ['空文字', ''],
  ])('%s のみの場合は false を返す', (_name, text) => {
    expect(containsJapaneseText(text)).toBe(false);
  });
});
