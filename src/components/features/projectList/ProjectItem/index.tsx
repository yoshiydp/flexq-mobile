import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Pressable,
  Text,
  Animated,
  Easing,
  ActivityIndicator,
  GestureResponderEvent,
} from 'react-native';
import { COLORS } from '@/globalStyles';
import { FontAwesome } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import type { FontAwesomeIconName } from '@/types/iconTypes';
import { formatDate } from '@/utils/formatDate';
import styles from './ProjectItem.styles';

const DEFAULT_ARTWORK = require('@/assets/images/default-artwork.png');

interface ProjectItemProps {
  artwork: any;
  projectName: string;
  soundSourceName: string;
  tags?: string[];
  updatedAt: Date;
  onPress: (event: GestureResponderEvent) => void;
  index?: number;
  startAnimation?: boolean;
  testID?: string;
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
  testID = 'project-item-pressable',
}: ProjectItemProps) {
  const translateX = useRef(new Animated.Value(50)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const animatedStarted = useRef(false);
  const [artworkLoading, setArtworkLoading] = useState(!!artwork?.uri);
  const artworkImageOpacity = useRef(new Animated.Value(artwork?.uri ? 0 : 1)).current;
  const artworkSpinnerOpacity = useRef(new Animated.Value(1)).current;

  const handleArtworkLoadEnd = () => {
    Animated.parallel([
      Animated.timing(artworkImageOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(artworkSpinnerOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setArtworkLoading(false));
  };

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
      <Pressable style={styles.container} onPress={onPress} testID={testID}>
        <View style={styles.artworkContainer}>
          <Animated.Image
            source={artwork ?? DEFAULT_ARTWORK}
            style={[styles.artwork, { opacity: artworkImageOpacity }]}
            onLoadEnd={handleArtworkLoadEnd}
          />
          {artworkLoading && (
            <Animated.View style={[styles.artworkLoadingIndicator, { opacity: artworkSpinnerOpacity }]}>
              <ActivityIndicator size="small" color={COLORS.accent.goldPrimary} />
            </Animated.View>
          )}
        </View>
        <View style={styles.infoContainer}>
          <Text style={styles.projectName}>{projectName}</Text>
          <Text style={styles.soundSourceName}>{soundSourceName}</Text>
          {tags && <Text style={styles.tags}>{tags.join(', ')}</Text>}
          <Text style={styles.updatedAt}>{formatDate(updatedAt)} UPDATE</Text>
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
