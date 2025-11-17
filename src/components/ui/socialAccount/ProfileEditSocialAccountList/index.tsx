import React, { FC } from 'react';
import { View } from 'react-native';
import { SvgProps } from 'react-native-svg';
import ProfileEditSocialAccountBox from '@/components/ui/socialAccount/ProfileEditSocialAccountBox';
import styles from './ProfileEditSocialAccountList.styles';

interface ProfileEditSocialAccountListProps {
  socialAccounts: {
    icon: FC<SvgProps>;
    username: string;
    isLinked: boolean;
  }[];
  onPressRemoveLink?: (index: number) => void;
  onPressLinkAccount?: (index: number) => void;
}

export default function ProfileEditSocialAccountList({
  socialAccounts,
  onPressRemoveLink,
  onPressLinkAccount,
}: ProfileEditSocialAccountListProps) {
  return (
    <View style={styles.container}>
      {socialAccounts.map((account, index) => (
        <ProfileEditSocialAccountBox
          key={index}
          socialIcon={account.icon}
          username={account.username}
          isLinked={account.isLinked}
          onPressRemoveLink={() => onPressRemoveLink?.(index)}
          onPressLinkAccount={() => onPressLinkAccount?.(index)}
        />
      ))}
    </View>
  );
}
