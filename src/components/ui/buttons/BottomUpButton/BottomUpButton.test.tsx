import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BottomUpButton from './index';

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return {
    FontAwesome: ({ name }: any) => <Text testID="mock-icon">{name}</Text>,
  };
});

jest.mock('@/components/ui/Icon', () => {
  const React = require('react');
  const MockIcon = ({ component: Comp, name, size, style }: any) => (
    <Comp name={name} size={size} style={style} />
  );
  MockIcon.displayName = 'MockIcon';
  return MockIcon;
});

describe('BottomUpButton コンポーネント', () => {
  it('label が正しく表示される', () => {
    const { getByText } = render(
      <BottomUpButton label="上に戻る" onPress={jest.fn()} />,
    );
    expect(getByText('上に戻る')).toBeTruthy();
  });

  it('デフォルトのアイコン（angle-up）が描画される', () => {
    const { getByTestId, getByText } = render(
      <BottomUpButton label="REC MODE" onPress={jest.fn()} />,
    );

    expect(getByTestId('mock-icon')).toBeTruthy();
    expect(getByText('angle-up')).toBeTruthy();
  });

  it('iconName を指定した場合、そのアイコン名が使われる', () => {
    const { getByText } = render(
      <BottomUpButton
        label="REC MODE"
        iconName="chevron-up"
        onPress={jest.fn()}
      />,
    );

    expect(getByText('chevron-up')).toBeTruthy();
  });

  it('ボタン押下時に onPress が呼ばれる', () => {
    const mockOnPress = jest.fn();

    const { getByTestId } = render(
      <BottomUpButton label="上へ" onPress={mockOnPress} testID="btn-up" />,
    );

    fireEvent.press(getByTestId('btn-up'));
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('testID が指定されない場合、デフォルト値が使用される', () => {
    const { getByTestId } = render(
      <BottomUpButton label="REC MODE" onPress={jest.fn()} />,
    );

    // デフォルト testID = 'bottom-up-button'
    expect(getByTestId('bottom-up-button')).toBeTruthy();
  });
});
