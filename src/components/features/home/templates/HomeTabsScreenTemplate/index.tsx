import React from 'react';
import { View, Animated } from 'react-native';
import styles from './HomeTabsScreenTemplate.styles';

interface AnimatedValues {
  translateY: Animated.Value;
  opacity: Animated.Value;
}

interface HomeTabsScreenTemplateProps {
  title: string;
  children: React.ReactNode;
  titleAnim1: AnimatedValues;
  titleAnim2: AnimatedValues;
}

export default function HomeTabsScreenTemplate({
  title,
  children,
  titleAnim1,
  titleAnim2,
}: HomeTabsScreenTemplateProps) {
  const [firstWord, secondWord] = title.split(' ');

  return (
    <View style={styles.container}>
      <View style={styles.titleContainer}>
        {/* Noto Sans JP はコンデンスフォントでないため fontSize 100 では
            横幅が画面を超える。折り返さず 1 行に収まるよう自動縮小する */}
        <Animated.Text
          style={[
            styles.title,
            {
              transform: [{ translateY: titleAnim1.translateY }],
              opacity: titleAnim1.opacity,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {firstWord}
        </Animated.Text>
        <Animated.Text
          style={[
            styles.title,
            {
              transform: [{ translateY: titleAnim2.translateY }],
              opacity: titleAnim2.opacity,
            },
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {secondWord}
        </Animated.Text>
      </View>
      {children}
    </View>
  );
}
