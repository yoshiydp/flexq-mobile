import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ArrowButton from './index';

jest.mock('@expo/vector-icons', () => ({
  FontAwesome: ({ name }: any) => <span data-testid="mock-icon">{name}</span>,
}));

jest.mock('@/components/ui/Icon', () => {
  const MockIcon = ({ component: Comp, name, size, style }: any) => (
    <Comp name={name} size={size} style={style} />
  );
  MockIcon.displayName = 'MockIcon';
  return MockIcon;
});

describe('ArrowButton コンポーネント', () => {
  it('label が正しく表示される', () => {
    const { getByText } = render(
      <ArrowButton label="次へ進む" onPress={jest.fn()} />,
    );
    expect(getByText('次へ進む')).toBeTruthy();
  });

  it('ボタン押下時に onPress が呼ばれる', () => {
    const mockOnPress = jest.fn();

    const { getByTestId } = render(
      <ArrowButton label="押す" onPress={mockOnPress} testID="arrow-btn" />,
    );

    const button = getByTestId('arrow-btn');
    fireEvent.press(button);

    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('testID が指定されない場合、デフォルト値が使用される', () => {
    const { getByTestId } = render(
      <ArrowButton label="デフォルトID" onPress={jest.fn()} />,
    );

    // デフォルト testID = 'arrow-button'
    expect(getByTestId('arrow-button')).toBeTruthy();
  });
});
