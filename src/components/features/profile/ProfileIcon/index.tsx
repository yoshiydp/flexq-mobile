import React from 'react';
import { View, Image, Pressable } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import type { FontAwesome6IconName } from '@/types/iconTypes';
import styles from './ProfileIcon.styles';

const DEFAULT_PROFILE = require('@/assets/images/default-profile.png');

interface ProfileIconProps {
  thumbnail?: { uri: string };
  editable?: boolean;
  onPressUpload?: () => void;
}

export default function ProfileIcon({
  thumbnail,
  editable = false,
  onPressUpload,
}: ProfileIconProps) {
  const source = thumbnail?.uri ? thumbnail : DEFAULT_PROFILE;

  return (
    <View style={styles.container}>
      <Image source={source} style={styles.thumbnail} />
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
