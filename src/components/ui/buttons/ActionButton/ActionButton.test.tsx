import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ActionButton from './index';

jest.mock('@expo/vector-icons', () => ({
  FontAwesome6: ({ name }: any) => <span data-testid="mock-icon">{name}</span>,
}));

jest.mock('@/components/ui/Icon', () => {
  const MockIcon = ({ name, size, style, component: Comp }: any) => (
    <Comp name={name} size={size} style={style} />
  );
  MockIcon.displayName = 'MockIcon';
  return MockIcon;
});

describe('ActionButton コンポーネント', () => {
  it('label が正しく表示される', () => {
    const { getByText } = render(
      <ActionButton label="テストボタン" iconName="plus" onPress={jest.fn()} />,
    );
    expect(getByText('テストボタン')).toBeTruthy();
  });

  it('ボタン押下で onPress が1回呼ばれる', () => {
    const mockOnPress = jest.fn();

    const { getByTestId } = render(
      <ActionButton
        label={<>Change{'\n'}Track</>}
        iconName="arrow-right-arrow-left"
        onPress={mockOnPress}
        testID="test-action-button"
      />,
    );

    const button = getByTestId('test-action-button');
    fireEvent.press(button);

    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('testID が指定されない場合はデフォルト値になる', () => {
    const { getByTestId } = render(
      <ActionButton label="削除" iconName="trash" onPress={jest.fn()} />,
    );

    // デフォルト testID = "action-button"
    expect(getByTestId('action-button')).toBeTruthy();
  });
});
