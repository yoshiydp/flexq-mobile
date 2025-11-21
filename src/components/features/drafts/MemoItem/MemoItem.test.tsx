import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import MemoItem from './index';

jest.mock('@/components/ui/Icon', () => {
  return jest.fn(({ name }) => {
    const { Text } = require('react-native');
    return <Text>{name}</Text>;
  });
});

describe('MemoItem コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockTitle = 'サンプルメモタイトル';
  const mockBody = 'テスト用のメモ本文です。';
  const mockUpdatedAt = new Date('2024-01-01T12:00:00Z');
  const mockOnPress = jest.fn();

  it('コンポーネントが正しくレンダリングされる', () => {
    render(
      <MemoItem
        title={mockTitle}
        body={mockBody}
        updatedAt={mockUpdatedAt}
        isBookmarked
        onPress={mockOnPress}
      />,
    );
  });

  it('isBookmarked が false のときにブックマークアイコンが表示されない', () => {
    const { queryByText } = render(
      <MemoItem
        title={mockTitle}
        body={mockBody}
        updatedAt={mockUpdatedAt}
        isBookmarked={false}
        onPress={mockOnPress}
      />,
    );

    const bookmarkIcon = queryByText('bookmark');
    expect(bookmarkIcon).toBeNull();
  });

  it('MemoItem を押したときに onPress が呼び出される', () => {
    const { getByText } = render(
      <MemoItem
        title={mockTitle}
        body={mockBody}
        updatedAt={mockUpdatedAt}
        isBookmarked
        onPress={mockOnPress}
      />,
    );

    const memoItem = getByText(mockTitle).parent;
    fireEvent.press(memoItem);

    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });
});
