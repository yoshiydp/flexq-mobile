import React, { View, Text } from 'react-native';
import { FC } from 'react';
import { SvgProps } from 'react-native-svg';
import ProfileSocialAccountList from '@/components/ui/socialAccount/ProfileSocialAccountList';
import styles from './ReadOnlyFormControl.styles';

interface SocialAccount {
  icon: FC<SvgProps>;
  username: string;
  isLinked: boolean;
}

interface Props {
  label: string;
  formValue?: string;
  showSocialAccounts?: boolean;
  socialAccounts?: SocialAccount[] | undefined;
}

export default function ReadOnlyFormControl({
  label,
  formValue,
  showSocialAccounts,
  socialAccounts,
}: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{label}</Text>
      {formValue && <Text style={styles.formValue}>{formValue}</Text>}
      {showSocialAccounts && socialAccounts && (
        <View style={styles.socialAccountContainer}>
          <ProfileSocialAccountList socialAccounts={socialAccounts} />
        </View>
      )}
    </View>
  );
}
