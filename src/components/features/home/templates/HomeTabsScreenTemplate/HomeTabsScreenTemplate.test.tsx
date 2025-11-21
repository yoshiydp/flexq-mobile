import React from 'react';
import { render } from '@testing-library/react-native';
import { Animated, Text } from 'react-native';
import HomeTabsScreenTemplate from './index';

describe('HomeTabsScreenTemplate コンポーネント', () => {
  const mockAnimatedValue = {
    translateY: new Animated.Value(0),
    opacity: new Animated.Value(1),
  };

  const mockProps = {
    title: 'ホーム',
    titleAnim1: {
      translateY: mockAnimatedValue.translateY,
      opacity: mockAnimatedValue.opacity,
    },
    titleAnim2: {
      translateY: mockAnimatedValue.translateY,
      opacity: mockAnimatedValue.opacity,
    },
  };

  it('コンポーネントが正しくレンダリングされる', () => {
    render(
      <HomeTabsScreenTemplate {...mockProps}>
        <Text>Child Component</Text>
      </HomeTabsScreenTemplate>,
    );
  });
});
