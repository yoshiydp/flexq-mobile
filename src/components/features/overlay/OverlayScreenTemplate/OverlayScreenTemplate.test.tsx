import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import OverlayScreenTemplate from './index';

const mockGoBack = jest.fn();

jest.mock('@react-navigation/native', () => {
  return {
    useNavigation: () => ({
      goBack: mockGoBack,
    }),
  };
});

jest.mock('@/components/ui/buttons/CloseButton', () => {
  const { Pressable, Text } = require('react-native');
  return jest.fn(({ onPress }) => (
    <Pressable onPress={onPress} testID="close-button">
      <Text>Close</Text>
    </Pressable>
  ));
});

describe('OverlayScreenTemplate コンポーネント', () => {
  const mockChildren = <Text>オーバーレイのコンテンツ</Text>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('コンポーネントが正しくレンダリングされる', () => {
    render(<OverlayScreenTemplate>{mockChildren}</OverlayScreenTemplate>);
  });

  it('閉じるボタンが押されたときに navigation.goBack が呼ばれる', () => {
    const { getByTestId } = render(
      <OverlayScreenTemplate>{mockChildren}</OverlayScreenTemplate>,
    );

    const closeButton = getByTestId('close-button');
    fireEvent.press(closeButton);

    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});
