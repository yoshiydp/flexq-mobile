import React, { FC } from 'react';
import { View, Text, Pressable } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import type { SvgProps } from 'react-native-svg';
import type { FontAwesome6IconName } from '@/types/iconTypes';
import styles from './ProfleEditSocialAccountBox.styles';

interface Props {
  socialIcon: FC<SvgProps>;
  username?: string;
  isLinked: boolean;
  onPressRemoveLink?: () => void;
  onPressLinkAccount?: () => void;
}

export default function ProfleEditSocialAccountBox({
  socialIcon: SocialIcon,
  username,
  isLinked,
  onPressRemoveLink,
  onPressLinkAccount,
}: Props) {
  const containerStyles = [styles.container, isLinked && styles.isLinked];

  return (
    <View style={containerStyles}>
      <View style={styles.socialIconContainer}>
        <SocialIcon />
      </View>

      {isLinked ? (
        <Text style={styles.username}>{username}</Text>
      ) : (
        <View style={styles.notLinkedContainer}>
          <Icon
            component={FontAwesome6}
            name={'link-slash' as FontAwesome6IconName}
            size={12}
            style={styles.notLinkedIcon}
          />
          <Text style={styles.notLinkedText}>Not linked</Text>
        </View>
      )}

      {isLinked ? (
        <Pressable onPress={onPressRemoveLink} style={styles.removeButton}>
          <Text style={styles.removeButtonText}>Remove Link</Text>
        </Pressable>
      ) : (
        <Pressable onPress={onPressLinkAccount} style={styles.linkButton}>
          <Text style={styles.linkButtonText}>Link Account</Text>
        </Pressable>
      )}
    </View>
  );
}
