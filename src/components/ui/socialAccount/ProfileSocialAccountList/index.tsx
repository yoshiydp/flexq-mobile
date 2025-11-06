import React, { FC } from 'react';
import { View } from 'react-native';
import { SvgProps } from 'react-native-svg';
import ProfleSocialAccountBox from '@/components/ui/socialAccount/ProfleSocialAccountBox';
import styles from './ProfileSocialAccountList.styles';

interface Props {
  socialAccounts: {
    icon: FC<SvgProps>;
    username: string;
    isLinked: boolean;
  }[];
}

export default function ProfileSocialAccountList({ socialAccounts }: Props) {
  return (
    <View style={styles.container}>
      {socialAccounts.map((account, index) => (
        <ProfleSocialAccountBox
          key={index}
          icon={account.icon}
          username={account.username}
          isLinked={account.isLinked}
        />
      ))}
    </View>
  );
}
