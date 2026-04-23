import React, { FC, useState } from 'react';
import { View, Text, TextInput, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
  readOnly?: boolean;
  showSocialAccounts?: boolean;
  socialAccounts?: SocialAccount[] | undefined;
  testID?: string;
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
  readOnly = false,
  showSocialAccounts,
  socialAccounts,
  onChangeText,
  onPressRemoveLink,
  onPressLinkAccount,
}: EditableFormControlProps) {
  const [value, setValue] = useState(formValue);
  const [isSecure, setIsSecure] = useState(!!secureTextEntry);

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

  const eyeColor = darkMode ? COLORS.form.default.text : COLORS.form.search.default;

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
      ) : secureTextEntry ? (
        <View style={styles.inputWrapper}>
          <TextInput
            style={[textInputStyles, readOnly && styles.readOnly, styles.passwordInput]}
            value={value}
            placeholder={placeholder}
            placeholderTextColor={
              darkMode ? COLORS.form.placeholder : COLORS.form.search.placeholder
            }
            onChangeText={handleChangeText}
            secureTextEntry={isSecure}
            editable={!readOnly}
          />
          <Pressable
            style={styles.eyeButton}
            onPress={() => setIsSecure((prev) => !prev)}
            hitSlop={8}
          >
            <Ionicons
              name={isSecure ? 'eye-off-outline' : 'eye-outline'}
              size={22}
              color={eyeColor}
            />
          </Pressable>
        </View>
      ) : (
        <TextInput
          style={[textInputStyles, readOnly && styles.readOnly]}
          value={value}
          placeholder={placeholder}
          placeholderTextColor={
            darkMode ? COLORS.form.placeholder : COLORS.form.search.placeholder
          }
          onChangeText={handleChangeText}
          secureTextEntry={false}
          editable={!readOnly}
        />
      )}
    </View>
  );
}
