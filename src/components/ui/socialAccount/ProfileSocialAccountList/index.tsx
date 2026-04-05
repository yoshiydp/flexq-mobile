import React, { FC } from 'react';
import { View } from 'react-native';
import { SvgProps } from 'react-native-svg';
import ProfileSocialAccountBox from '@/components/ui/socialAccount/ProfileSocialAccountBox';
import styles from './ProfileSocialAccountList.styles';

interface Props {
  socialAccounts: {
    icon: FC<SvgProps>;
    username: string;
    isLinked: boolean;
  }[];
  onPressLinkAccount?: (index: number) => void;
}

export default function ProfileSocialAccountList({ socialAccounts, onPressLinkAccount }: Props) {
  return (
    <View style={styles.container}>
      {socialAccounts.map((account, index) => (
        <ProfileSocialAccountBox
          key={index}
          icon={account.icon}
          username={account.username}
          isLinked={account.isLinked}
          onPressLinkAccount={() => onPressLinkAccount?.(index)}
        />
      ))}
    </View>
  );
}
