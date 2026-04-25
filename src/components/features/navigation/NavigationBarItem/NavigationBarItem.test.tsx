import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import NavigationBarItem from './index';

jest.mock('@/components/ui/Icon', () => {
  const { Text } = require('react-native');
  return jest.fn(({ name }) => <Text>{name}</Text>);
});

describe('NavigationBarItem コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockProps: React.ComponentProps<typeof NavigationBarItem> = {
    icon: 'home',
    label: 'ホーム',
    active: true,
    onPress: jest.fn(),
    onLayout: jest.fn(),
  };

  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByText } = render(<NavigationBarItem {...mockProps} />);
    getByText(mockProps.icon);
    getByText(mockProps.label);
  });

  it('ナビゲーションアイテムが押されたら onPress が呼ばれる', () => {
    const { getByText } = render(<NavigationBarItem {...mockProps} />);
    const navItem = getByText(mockProps.label).parent;
    fireEvent.press(navItem);

    expect(mockProps.onPress).toHaveBeenCalledTimes(1);
  });

  it('onLayout が呼ばれる', () => {
    const { getByText } = render(<NavigationBarItem {...mockProps} />);
    const navItem = getByText(mockProps.label).parent;
    fireEvent(navItem, 'layout', {
      nativeEvent: {
        layout: { x: 0, y: 0, width: 100, height: 50 },
      },
    });

    expect(mockProps.onLayout).toHaveBeenCalledTimes(1);
  });

  it('testID が Pressable に設定される', () => {
    const { getByTestId } = render(
      <NavigationBarItem {...mockProps} testID="nav-home" />,
    );
    expect(getByTestId('nav-home')).toBeTruthy();
  });
});
