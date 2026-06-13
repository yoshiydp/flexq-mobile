import React, { useState } from 'react';
import { View, Text, Pressable, Alert, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import AppLogo from '@/components/ui/logo/AppLogo';
import EditableFormControl from '@/components/ui/form/EditableFormControl';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { useModal } from '@/contexts/ModalContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { PLACEHOLDERS } from '@/constants/placeholders';
import type { RootStackParamList } from '@/navigation/types';
import styles from './SignInScreen.styles';

export default function SignInScreen() {
  const navigation =
    useNavigation<StackNavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { showLoading, hideLoading } = useModal();
  const { login, isAuthenticated } = useAuthContext();

  const submitSignIn = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please enter your email and password.');
      return;
    }

    showLoading();
    await login(email, password);
    hideLoading();

    if (isAuthenticated) {
      navigation.navigate('HomeTabs');
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <View style={styles.container}>
        <View style={styles.appLogoContainer}>
          <AppLogo />
        </View>
        <View style={styles.formControlContainer}>
          <EditableFormControl
            label="Your Email"
            darkMode
            formValue={email}
            onChangeText={setEmail}
            placeholder={PLACEHOLDERS.signIn.emailInput}
          />
          <EditableFormControl
            label="Password"
            darkMode
            secureTextEntry
            formValue={password}
            onChangeText={setPassword}
            placeholder={PLACEHOLDERS.signIn.passwordInput}
          />
          <Pressable
            style={styles.resetPasswordLink}
            onPress={() => navigation.navigate('PasswordReset')}
          >
            <Text style={styles.resetPasswordText}>パスワードをリセットする</Text>
          </Pressable>
        </View>
        <View style={styles.signInButtonWrapper}>
          <SubmitButton
            label="Sign In"
            onPress={submitSignIn}
            disabled={!email || !password}
          />
        </View>
        <View style={styles.registerLinkContainer}>
          <Text style={styles.registerLinkLabel}>アカウントはお持ちですか？</Text>
          <Pressable onPress={() => navigation.navigate('Register')}>
            <Text style={styles.registerLinkText}>新規登録へ</Text>
          </Pressable>
        </View>
      </View>
    </TouchableWithoutFeedback>
  );
}
