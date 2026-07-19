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
        <Animated.Text
          style={[
            styles.title,
            {
              transform: [{ translateY: titleAnim1.translateY }],
              opacity: titleAnim1.opacity,
            },
          ]}
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
        >
          {secondWord}
        </Animated.Text>
      </View>
      {children}
    </View>
  );
}
