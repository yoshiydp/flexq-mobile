import React, { useState } from 'react';
import { View, Text, Pressable, Alert, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import GoogleIcon from '@/assets/icons/google-icon.svg';
import AppLogo from '@/components/ui/logo/AppLogo';
import EditableFormControl from '@/components/ui/form/EditableFormControl';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { useModal } from '@/contexts/ModalContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import { PLACEHOLDERS } from '@/constants/placeholders';
import type { RootStackParamList } from '@/navigation/types';
import styles from './SignInScreen.styles';

export default function SignInScreen() {
  const navigation =
    useNavigation<StackNavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { showLoading, hideLoading } = useModal();
  const { login, loginWithGoogle, isAuthenticated } = useAuthContext();
  const { signIn: googleSignIn, ready: googleReady } = useGoogleAuth();

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

  const submitGoogleSignIn = async () => {
    try {
      // キャンセル（null）は無通知で画面に留まる
      const result = await googleSignIn();
      if (!result) return;

      showLoading();
      const succeeded = await loginWithGoogle(result.accessToken);
      if (succeeded) {
        navigation.navigate('HomeTabs');
      }
    } catch (err) {
      console.error('Google sign-in failed:', err);
      Alert.alert('エラー', 'Google ログインに失敗しました。');
    } finally {
      hideLoading();
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
        <View style={styles.dividerContainer}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>OR</Text>
          <View style={styles.dividerLine} />
        </View>
        <Pressable
          style={styles.googleButton}
          onPress={submitGoogleSignIn}
          disabled={!googleReady}
          testID="google-signin-button"
        >
          <GoogleIcon width={20} height={20} />
          <Text style={styles.googleButtonLabel}>Login with Google</Text>
        </Pressable>
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
