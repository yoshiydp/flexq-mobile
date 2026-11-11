import { hasVisibleText } from './hasVisibleText';

describe('hasVisibleText', () => {
  it.each([undefined, null, '', '<p></p>', '<p><br></p>', '<p>&nbsp;</p>', '<p> </p><p></p>'])(
    '空のエディタ（%p）は false',
    (html) => {
      expect(hasVisibleText(html)).toBe(false);
    },
  );

  it('文字が 1 文字でもあれば true', () => {
    expect(hasVisibleText('<p><strong>a</strong></p>')).toBe(true);
    expect(hasVisibleText('歌詞')).toBe(true);
  });
});
