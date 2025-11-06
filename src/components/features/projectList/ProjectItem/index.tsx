import React, { useEffect, useRef } from 'react';
import {
  View,
  Pressable,
  Text,
  Animated,
  Easing,
  Image,
  GestureResponderEvent,
} from 'react-native';
import { FontAwesome } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import type { FontAwesomeIconName } from '@/types/iconTypes';
import styles from './ProjectItem.styles';

interface ProjectItemProps {
  artwork: any;
  projectName: string;
  soundSourceName: string;
  tags?: string[];
  updatedAt: Date;
  onPress: (event: GestureResponderEvent) => void;
  index?: number;
  startAnimation?: boolean;
}

export default function ProjectItem({
  artwork,
  projectName,
  soundSourceName,
  tags,
  updatedAt,
  onPress,
  index = 0,
  startAnimation = false,
}: ProjectItemProps) {
  const translateX = useRef(new Animated.Value(50)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const animatedStarted = useRef(false);

  useEffect(() => {
    if (startAnimation && !animatedStarted.current) {
      animatedStarted.current = true;

      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 400,
          delay: index * 50,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 400,
          delay: index * 50,
          easing: Easing.out(Easing.exp),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [startAnimation, index, translateX, opacity]);

  return (
    <Animated.View style={{ transform: [{ translateX }], opacity }}>
      <Pressable style={styles.container} onPress={onPress}>
        <View style={styles.artworkContainer}>
          {artwork && <Image source={artwork} style={styles.artwork} />}
        </View>
        <View style={styles.infoContainer}>
          <Text style={styles.projectName}>{projectName}</Text>
          <Text style={styles.soundSourceName}>{soundSourceName}</Text>
          {tags && <Text style={styles.tags}>{tags.join(', ')}</Text>}
          <Text style={styles.updatedAt}>
            {updatedAt.toLocaleDateString()} UPDATE
          </Text>
        </View>
        <View style={styles.iconContainer}>
          <Icon
            component={FontAwesome}
            name={'angle-right' as FontAwesomeIconName}
            size={30}
            style={styles.icon}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}
