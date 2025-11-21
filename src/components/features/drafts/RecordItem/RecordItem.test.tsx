import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import RecordItem from './index';

jest.mock('@/components/ui/Icon', () => {
  return jest.fn(({ name }) => {
    const { Text } = require('react-native');
    return <Text>{name}</Text>;
  });
});

describe('RecordItem コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockTitle = 'サンプルレコードタイトル';
  const mockUpdatedAt = new Date('2024-01-01T12:00:00Z');
  const mockOnPress = jest.fn();

  it('コンポーネントが正しくレンダリングされる', () => {
    render(
      <RecordItem
        title={mockTitle}
        updatedAt={mockUpdatedAt}
        isBookmarked
        onPress={mockOnPress}
      />,
    );
  });

  it('isBookmarked が false のときにブックマークアイコンが表示されない', () => {
    const { queryByText } = render(
      <RecordItem
        title={mockTitle}
        updatedAt={mockUpdatedAt}
        isBookmarked={false}
        onPress={mockOnPress}
      />,
    );

    const bookmarkIcon = queryByText('bookmark');
    expect(bookmarkIcon).toBeNull();
  });

  it('RecordItem を押したときに onPress が呼び出される', () => {
    const { getByText } = render(
      <RecordItem
        title={mockTitle}
        updatedAt={mockUpdatedAt}
        isBookmarked
        onPress={mockOnPress}
      />,
    );

    const recordItem = getByText(mockTitle).parent;
    fireEvent.press(recordItem);

    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });
});
