import React from 'react';
import { View, Image } from 'react-native';
import styles from './Artwork.styles';

const DEFAULT_ARTWORK = require('@/assets/images/default-artwork.png');

interface ArtworkProps {
  artwork?: any;
  testID?: string;
}

export default function Artwork({ artwork, testID }: ArtworkProps) {
  return (
    <View style={styles.container}>
      <Image
        source={artwork?.uri ? artwork : DEFAULT_ARTWORK}
        style={styles.artwork}
        resizeMode="cover"
        testID={testID || 'artwork-image'}
      />
    </View>
  );
}
