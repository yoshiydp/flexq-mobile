import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { FontAwesome6 } from '@expo/vector-icons';
import Icon from '@/components/ui/Icon';
import styles from './ProfleSocialAccountBox.styles';
import type { SvgProps } from 'react-native-svg';
import type { FC } from 'react';
import type { FontAwesome6IconName } from '@/types/iconTypes';

interface Props {
  icon?: FC<SvgProps>;
  username?: string;
  isLinked: boolean;
}

export default function ProfleSocialAccountBox({
  icon: SocialIcon,
  username,
  isLinked,
}: Props) {
  const containerStyles = [styles.container, isLinked && styles.isLinked];

  return (
    <View style={containerStyles}>
      <View style={styles.socialIconContainer}>
        {typeof SocialIcon === 'function' ? <SocialIcon /> : null}
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
        <Icon
          component={FontAwesome6}
          name={'link' as FontAwesome6IconName}
          size={18}
          style={styles.linkIcon}
        />
      ) : (
        <Pressable style={styles.linkButton}>
          <Text style={styles.linkButtonText}>Link Account</Text>
        </Pressable>
      )}
    </View>
  );
}
