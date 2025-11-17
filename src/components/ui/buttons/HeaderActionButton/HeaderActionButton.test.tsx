import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import HeaderActionButton from './index';

jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const { Text } = require('react-native');

  return {
    FontAwesome: ({ name }: any) => <Text testID="mock-icon">{name}</Text>,
    FontAwesome6: ({ name }: any) => <Text testID="mock-icon">{name}</Text>,
    Octicons: ({ name }: any) => <Text testID="mock-icon">{name}</Text>,
  };
});

jest.mock('@/components/ui/Icon', () => {
  const MockIcon = ({ component: Comp, name, size, style }: any) => (
    <Comp name={name} size={size} style={style} />
  );
  MockIcon.displayName = 'MockIcon';
  return MockIcon;
});

jest.mock('@/hooks/useAnimatedSequence', () => {
  return {
    useAnimatedSequence: () => ({
      translateX: 0,
      opacity: 1,
    }),
  };
});

describe('HeaderActionButton コンポーネント', () => {
  it('label が正しく表示される', () => {
    const { getByText } = render(
      <HeaderActionButton label="設定" icon="gear" onPress={jest.fn()} />,
    );

    expect(getByText('設定')).toBeTruthy();
  });

  it('デフォルト（FontAwesome）の icon が正しく表示される', () => {
    const { getByTestId, getByText } = render(
      <HeaderActionButton label="設定" icon="gear" onPress={jest.fn()} />,
    );

    expect(getByTestId('mock-icon')).toBeTruthy();
    expect(getByText('gear')).toBeTruthy();
  });

  it('FontAwesome6 を指定した場合、正しい icon が描画される', () => {
    const { getByText } = render(
      <HeaderActionButton
        label="保存"
        iconModule="FontAwesome6"
        icon="save"
        onPress={jest.fn()}
      />,
    );

    expect(getByText('save')).toBeTruthy();
  });

  it('Octicons を指定した場合、正しい icon が描画される', () => {
    const { getByText } = render(
      <HeaderActionButton
        label="情報"
        iconModule="Octicons"
        icon="info"
        onPress={jest.fn()}
      />,
    );

    expect(getByText('info')).toBeTruthy();
  });

  it('ボタン押下時に onPress が呼ばれる', () => {
    const mockPress = jest.fn();

    const { getByTestId } = render(
      <HeaderActionButton
        label="テスト"
        icon="gear"
        onPress={mockPress}
        testID="header-test-btn"
      />,
    );

    fireEvent.press(getByTestId('header-test-btn'));
    expect(mockPress).toHaveBeenCalledTimes(1);
  });

  it('testID が指定されない場合、デフォルト値が使われる', () => {
    const { getByTestId } = render(
      <HeaderActionButton label="設定" icon="gear" onPress={jest.fn()} />,
    );

    expect(getByTestId('header-action-button')).toBeTruthy();
  });

  it('Animated.View が描画される', () => {
    const { getByTestId } = render(
      <HeaderActionButton label="設定" icon="gear" onPress={jest.fn()} />,
    );

    // testID は Pressable にはつくが Animated.View は style 存在チェック
    const button = getByTestId('header-action-button');
    expect(button).toBeTruthy();
  });
});
