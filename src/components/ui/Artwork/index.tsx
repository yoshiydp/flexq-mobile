import React, { useState, useRef } from 'react';
import { View, Animated, ActivityIndicator } from 'react-native';
import { COLORS } from '@/globalStyles';
import styles from './Artwork.styles';

const DEFAULT_ARTWORK = require('@/assets/images/default-artwork.png');

interface ArtworkProps {
  artwork?: any;
  testID?: string;
}

export default function Artwork({ artwork, testID }: ArtworkProps) {
  const isRemote = !!artwork?.uri;
  const [loading, setLoading] = useState(isRemote);
  const imageOpacity = useRef(new Animated.Value(isRemote ? 0 : 1)).current;
  const spinnerOpacity = useRef(new Animated.Value(1)).current;

  const handleLoadEnd = () => {
    Animated.parallel([
      Animated.timing(imageOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(spinnerOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]).start(() => setLoading(false));
  };

  return (
    <View style={styles.container}>
      <Animated.Image
        source={isRemote ? artwork : DEFAULT_ARTWORK}
        style={[styles.artwork, { opacity: imageOpacity }]}
        resizeMode="cover"
        testID={testID || 'artwork-image'}
        onLoadEnd={handleLoadEnd}
      />
      {loading && (
        <Animated.View style={[styles.loadingIndicator, { opacity: spinnerOpacity }]}>
          <ActivityIndicator size="small" color={COLORS.accent.goldPrimary} />
        </Animated.View>
      )}
    </View>
  );
}
