import React from 'react';
import { LayoutChangeEvent } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import NavigationBar from './index';
import { NAVIGATION_ITEMS } from '@/constants/navigationItems';

jest.mock('@/components/features/navigation/NavigationBarItem', () => {
  const { Pressable, Text } = require('react-native');
  const MockNavItem = ({ label, onPress, onLayout, testID }: any) => (
    <Pressable
      onLayout={(e: LayoutChangeEvent) => onLayout && onLayout(e)}
      onPress={onPress}
      testID={testID}
    >
      <Text>{label}</Text>
    </Pressable>
  );
  MockNavItem.displayName = 'NavigationBarItem';
  return MockNavItem;
});

describe('NavigationBar コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('コンポーネントが正しくレンダリングされる', () => {
    const mockState = {
      index: 0,
      routes: NAVIGATION_ITEMS.map((item) => ({ name: item.route })),
    } as any;

    const mockNavigation = {
      navigate: jest.fn(),
    } as any;

    const { getByText } = render(
      <NavigationBar
        {...({ state: mockState, navigation: mockNavigation } as any)}
      />,
    );

    NAVIGATION_ITEMS.forEach((item) => {
      getByText(item.label);
    });
  });

  it('ナビゲーションアイテムが押されたら navigate が呼ばれる', () => {
    const mockState = {
      index: 0,
      routes: NAVIGATION_ITEMS.map((item) => ({ name: item.route })),
    } as any;

    const mockNavigation = {
      navigate: jest.fn(),
    } as any;

    const { getByText } = render(
      <NavigationBar
        {...({ state: mockState, navigation: mockNavigation } as any)}
      />,
    );

    const targetItem = NAVIGATION_ITEMS[0];
    const targetItemButton = getByText(targetItem.label);

    fireEvent.press(targetItemButton);
    expect(mockNavigation.navigate).toHaveBeenCalledWith(targetItem.route);
  });

  it('各ナビゲーションアイテムに nav-{route} の testID が設定される', () => {
    const mockState = {
      index: 0,
      routes: NAVIGATION_ITEMS.map((item) => ({ name: item.route })),
    } as any;

    const mockNavigation = {
      navigate: jest.fn(),
    } as any;

    const { getByTestId } = render(
      <NavigationBar
        {...({ state: mockState, navigation: mockNavigation } as any)}
      />,
    );

    NAVIGATION_ITEMS.forEach((item) => {
      expect(getByTestId(`nav-${item.route}`)).toBeTruthy();
    });
  });
});
