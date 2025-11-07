import React, { useEffect, useRef, useState } from 'react';
import { View, Animated } from 'react-native';
import { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import NavigationBarItem from '@/components/features/navigation/NavigationBarItem';
import { NAVIGATION_ITEMS } from '@/constants/navigationItems';
import styles from './NavigationBar.styles';

export default function NavigationBar({
  state,
  navigation,
}: BottomTabBarProps) {
  const indicatorX = useRef(new Animated.Value(0)).current;
  const [layouts, setLayouts] = useState<
    Record<string, { x: number; width: number }>
  >({});

  const handleLayout = (
    route: string,
    { x, width }: { x: number; width: number },
  ) => {
    setLayouts((prev) => ({ ...prev, [route]: { x, width } }));
  };

  useEffect(() => {
    const currentRoute = state.routes[state.index].name;
    const layout = layouts[currentRoute];
    if (!layout) return;
    const indicatorWidth = 30;
    const targetX = layout.x + layout.width / 2 - indicatorWidth / 2;

    Animated.spring(indicatorX, {
      toValue: targetX,
      useNativeDriver: true,
    }).start();
  }, [state.index, state.routes, layouts, indicatorX]);

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[styles.indicator, { transform: [{ translateX: indicatorX }] }]}
      />
      <View style={styles.bar}>
        {NAVIGATION_ITEMS.map((item) => (
          <NavigationBarItem
            key={item.label}
            {...item}
            active={state.routes[state.index].name === item.route}
            onPress={() => navigation.navigate(item.route)}
            onLayout={(e) => handleLayout(item.route, e.nativeEvent.layout)}
          />
        ))}
      </View>
    </View>
  );
}
