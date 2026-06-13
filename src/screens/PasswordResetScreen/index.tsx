import React, { useState } from 'react';
import { View, Alert, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import HeaderToolBar from '@/components/ui/HeaderToolBar';
import EditableFormControl from '@/components/ui/form/EditableFormControl';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { useModal } from '@/contexts/ModalContext';
import {
  HEADER_TOOLBAR_TEMPLATES,
  HeaderToolBarButton,
} from '@/constants/headerToolBarButtons';
import { PLACEHOLDERS } from '@/constants/placeholders';
import { DefaultService } from '@/apiClient/services/DefaultService';
import type { RootStackParamList } from '@/navigation/types';
import styles from './PasswordResetScreen.styles';

export default function PasswordResetScreen() {
  const navigation =
    useNavigation<StackNavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const { showLoading, hideLoading } = useModal();

  const handleGoBack = () => navigation.goBack();

  const handlePasswordReset = async () => {
    if (!email || !newPassword) {
      Alert.alert('Error', 'メールアドレスとパスワードを入力してください。');
      return;
    }

    showLoading();
    try {
      await DefaultService.postDataAuthResetPassword({ email, newPassword });
    } catch (err: any) {
      const status = err?.status;
      if (status === 404) {
        Alert.alert('エラー', '該当のメールアドレスが見つかりません。');
      } else {
        Alert.alert('エラー', 'パスワードのリセットに失敗しました。');
      }
      return;
    } finally {
      hideLoading();
    }

    Alert.alert(
      'パスワードをリセットしました',
      'パスワードをリセットしましたので、再度ログイン画面にてメールアドレスとパスワードを入力してください',
      [{ text: 'OK', onPress: () => navigation.navigate('SignIn') }],
    );
  };

  const headerItems: HeaderToolBarButton[] = [
    { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
    {
      ...HEADER_TOOLBAR_TEMPLATES.headerTitle,
      headerTitle: 'PASSWORD RESET',
    },
  ];

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <HeaderToolBar items={headerItems} />
        <View style={styles.formContainer}>
          <EditableFormControl
            label="Email"
            darkMode
            formValue={email}
            onChangeText={setEmail}
            placeholder={PLACEHOLDERS.passwordReset.emailInput}
          />
          <EditableFormControl
            label="New Password"
            darkMode
            secureTextEntry
            formValue={newPassword}
            onChangeText={setNewPassword}
            placeholder={PLACEHOLDERS.passwordReset.newPasswordInput}
          />
        </View>
        <SubmitButton
          containerClassName={styles.submitButton}
          label="PASSWORD RESET"
          onPress={handlePasswordReset}
          disabled={!email || !newPassword}
        />
      </View>
    </TouchableWithoutFeedback>
  );
}
