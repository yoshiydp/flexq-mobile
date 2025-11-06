import React, { FC, useState } from 'react';
import { View, Text, TextInput } from 'react-native';
import { SvgProps } from 'react-native-svg';
import ProfileEditSocialAccountList from '@/components/ui/socialAccount/ProfileEditSocialAccountList';
import styles from './EditableFormControl.styles';
import { COLORS } from '@/globalStyles';

interface SocialAccount {
  icon: FC<SvgProps>;
  username: string;
  isLinked: boolean;
}

interface EditableFormControlProps {
  darkMode?: boolean;
  label?: string;
  formValue?: string;
  placeholder?: string;
  secureTextEntry?: boolean;
  showSocialAccounts?: boolean;
  socialAccounts?: SocialAccount[] | undefined;
  onChangeText?: (text: string) => void;
  onPressRemoveLink?: (index: number) => void;
  onPressLinkAccount?: (index: number) => void;
}

export default function EditableFormControl({
  darkMode,
  label,
  formValue = '',
  placeholder = '',
  secureTextEntry,
  showSocialAccounts,
  socialAccounts,
  onChangeText,
  onPressRemoveLink,
  onPressLinkAccount,
}: EditableFormControlProps) {
  const [value, setValue] = useState(formValue);
  const labelStyles = [
    styles.label,
    darkMode ? styles.darkLabel : styles.lightLabel,
  ];
  const textInputStyles = [
    styles.textInput,
    darkMode ? styles.darktextInput : styles.lightTextInput,
  ];

  const handleChangeText = (text: string) => {
    setValue(text);
    onChangeText?.(text);
  };

  return (
    <View style={styles.container}>
      {label && <Text style={labelStyles}>{label}</Text>}
      {showSocialAccounts && socialAccounts ? (
        <View style={styles.socialAccountContainer}>
          <ProfileEditSocialAccountList
            socialAccounts={socialAccounts}
            onPressRemoveLink={onPressRemoveLink}
            onPressLinkAccount={onPressLinkAccount}
          />
        </View>
      ) : (
        <TextInput
          style={textInputStyles}
          value={value}
          placeholder={placeholder}
          placeholderTextColor={
            darkMode ? COLORS.form.placeholder : COLORS.form.search.placeholder
          }
          onChangeText={handleChangeText}
          secureTextEntry={!!secureTextEntry}
        />
      )}
    </View>
  );
}
