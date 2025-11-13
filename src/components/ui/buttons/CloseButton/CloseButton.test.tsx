import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CloseButton from './index';

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return {
    Ionicons: ({ name }: any) => <Text testID="mock-ionicon">{name}</Text>,
  };
});

jest.mock('@/components/ui/Icon', () => {
  const ComponentMock = ({ component: Comp, name, size, style }: any) => {
    return <Comp name={name} size={size} style={style} />;
  };
  ComponentMock.displayName = 'IconMock';
  return ComponentMock;
});

describe('CloseButton コンポーネント', () => {
  it('デフォルト testID "close-button" で表示される', () => {
    const { getByTestId } = render(<CloseButton onPress={jest.fn()} />);

    // デフォルト testID = "close-button"
    expect(getByTestId('close-button')).toBeTruthy();
  });

  it('ボタン押下で onPress が1回呼ばれる', () => {
    const mockPress = jest.fn();

    const { getByTestId } = render(
      <CloseButton onPress={mockPress} testID="close-btn" />,
    );

    fireEvent.press(getByTestId('close-btn'));
    expect(mockPress).toHaveBeenCalledTimes(1);
  });

  it('Ionicons の close-sharp アイコンが描画される', () => {
    const { getByTestId, getByText } = render(
      <CloseButton onPress={jest.fn()} />,
    );

    expect(getByTestId('mock-ionicon')).toBeTruthy();

    expect(getByText('close-sharp')).toBeTruthy();
  });
});
