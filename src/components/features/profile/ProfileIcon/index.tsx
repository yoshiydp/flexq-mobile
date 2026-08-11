import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Animated,
  Pressable,
  ActivityIndicator,
  type ImageSourcePropType,
} from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import type { FontAwesome6IconName } from '@/types/iconTypes';
import { COLORS } from '@/globalStyles';
import styles from './ProfileIcon.styles';

const DEFAULT_PROFILE = require('@/assets/images/default-profile.png');

interface ProfileIconProps {
  thumbnail?: { uri: string };
  editable?: boolean;
  onPressUpload?: () => void;
  fallbackSource?: ImageSourcePropType;
}

export default function ProfileIcon({
  thumbnail,
  editable = false,
  onPressUpload,
  fallbackSource = DEFAULT_PROFILE,
}: ProfileIconProps) {
  const isRemote = !!thumbnail?.uri;
  const [loading, setLoading] = useState(isRemote);
  const imageOpacity = useRef(new Animated.Value(isRemote ? 0 : 1)).current;
  const spinnerOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (thumbnail?.uri) {
      imageOpacity.setValue(0);
      spinnerOpacity.setValue(1);
      setLoading(true);
    }
  }, [thumbnail?.uri, imageOpacity, spinnerOpacity]);

  const handleLoadEnd = () => {
    Animated.parallel([
      Animated.timing(imageOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(spinnerOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setLoading(false));
  };

  const source = isRemote ? thumbnail : fallbackSource;

  return (
    <View style={styles.container}>
      <Animated.Image
        source={source}
        style={[styles.thumbnail, { opacity: imageOpacity }]}
        onLoadEnd={handleLoadEnd}
      />
      {loading && (
        <Animated.View style={[styles.loadingIndicator, { opacity: spinnerOpacity }]}>
          <ActivityIndicator size="small" color={COLORS.accent.goldPrimary} />
        </Animated.View>
      )}
      {editable && (
        <Pressable style={styles.uploadButton} onPress={onPressUpload}>
          <Icon
            component={FontAwesome6}
            name={'upload' as FontAwesome6IconName}
            size={18}
            style={styles.uploadButtonIcon}
          />
        </Pressable>
      )}
    </View>
  );
}
