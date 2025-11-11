import React from 'react';
import { View, Image } from 'react-native';
import styles from './Artwork.styles';

interface ArtworkProps {
  artwork: any;
  testID?: string;
}

export default function Artwork({ artwork, testID }: ArtworkProps) {
  return (
    <View style={styles.container}>
      {artwork && (
        <Image
          source={artwork}
          style={styles.artwork}
          testID={testID || 'artwork-image'}
        />
      )}
    </View>
  );
}
