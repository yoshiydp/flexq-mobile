import React, { useState } from 'react';
import { View, Text, ScrollView, Alert, Keyboard, Pressable } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import GoogleIcon from '@/assets/icons/google-icon.svg';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import HeaderToolBar from '@/components/ui/HeaderToolBar';
import ProfileIcon from '@/components/features/profile/ProfileIcon';
import EditableFormControl from '@/components/ui/form/EditableFormControl';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { useUpdateProfile } from '@/hooks/useUpdateProfile';
import { useResendCountdown } from '@/hooks/useResendCountdown';
import { useModal } from '@/contexts/ModalContext';
import { useAuthContext } from '@/contexts/AuthContext';
import { useGoogleAuth } from '@/hooks/useGoogleAuth';
import {
  HEADER_TOOLBAR_TEMPLATES,
  HeaderToolBarButton,
} from '@/constants/headerToolBarButtons';
import { PLACEHOLDERS } from '@/constants/placeholders';
import {
  verificationCodeFailureMessage,
  verificationSentNotice,
} from '@/utils/verificationCode';
import type { RootStackParamList } from '@/navigation/types';
import { useBlockAndroidBackGesture } from '@/hooks/useBlockAndroidBackGesture';
import styles from './RegisterScreen.styles';

export default function RegisterScreen() {
  const navigation =
    useNavigation<StackNavigationProp<RootStackParamList>>();
  const { login, loginWithGoogle } = useAuthContext();
  const { signIn: googleSignIn, ready: googleReady } = useGoogleAuth();
  const { uploadThumbnail, updateProfile } = useUpdateProfile();
  const { showLoading, hideLoading } = useModal();

  const [thumbnailUri, setThumbnailUri] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // メール検証ステップ（TASK-85）: form で入力 → verify で認証コードを入力して登録
  const [step, setStep] = useState<'form' | 'verify'>('form');
  const [code, setCode] = useState('');
  // EditableFormControl は内部 state を持つため、再送時は key を変えて
  // 再マウントし、表示中の古いコードをクリアする
  const [codeFieldKey, setCodeFieldKey] = useState(0);
  const { secondsLeft, canResend, start: startResendCountdown } =
    useResendCountdown();

  const handleGoBack = () => {
    // 認証コード入力中の戻るは入力フォームへ戻す（画面は離脱しない）
    if (step === 'verify') {
      setStep('form');
      setCode('');
      return;
    }
    navigation.goBack();
  };

  // Android のシステム back ジェスチャー / 戻るボタンをヘッダーの戻るボタンと同じ処理に接続する（TASK-113）
  // 認証コード入力中は入力フォームへ戻す
  useBlockAndroidBackGesture(handleGoBack);

  const handlePickThumbnail = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });
    if (!result.canceled && result.assets?.length) {
      setThumbnailUri(result.assets[0].uri);
    }
  };

  // メールアドレス宛に 6 桁の認証コードを送信して検証ステップへ進む
  const handleSendCode = async () => {
    Keyboard.dismiss();
    if (!username || !email || !password) {
      Alert.alert('Error', '全ての項目を入力してください。');
      return;
    }

    showLoading();
    try {
      const res = await DefaultService.postDataAuthVerificationCode({
        email,
        purpose: 'register',
      });
      startResendCountdown(res?.resendIn ?? 60);
      setCode('');
      setCodeFieldKey((prev) => prev + 1);
      if (step !== 'verify') {
        setStep('verify');
      } else {
        Alert.alert('認証コードを再送しました', 'メールをご確認ください。');
      }
    } catch (err: any) {
      // 登録済みメールでも API は同じ 200 を返す（TASK-104・アカウント列挙対策）ため
      // 409 の分岐はない。本人には「登録済み」の案内メールが届く
      const status = err?.status;
      if (status === 429) {
        Alert.alert(
          'エラー',
          '認証コードを再送できるまで少しお待ちください。',
        );
      } else {
        Alert.alert(
          'エラー',
          '認証コードの送信に失敗しました。メールアドレスをご確認のうえ、時間をおいて再度お試しください。',
        );
      }
    } finally {
      hideLoading();
    }
  };

  const handleCreate = async () => {
    Keyboard.dismiss();
    if (code.length !== 6) {
      Alert.alert('Error', '6桁の認証コードを入力してください。');
      return;
    }

    showLoading();
    try {
      await DefaultService.postDataAuthRegister({
        username,
        email,
        password,
        code,
      });
      await login(email, password);

      // ログイン後、サムネイルを S3 アップロード → プロフィール更新
      if (thumbnailUri) {
        const thumbnailKey = await uploadThumbnail(thumbnailUri);
        await updateProfile({ username, thumbnailKey });
      }

      // 全処理完了後に遷移
      navigation.navigate('HomeTabs');
    } catch (err: any) {
      const codeMessage = verificationCodeFailureMessage(err?.body?.reason);
      if (codeMessage) {
        Alert.alert('エラー', codeMessage);
      } else if (err?.status === 409) {
        Alert.alert('エラー', 'このメールアドレスはすでに登録されています。');
      } else {
        Alert.alert('エラー', '登録に失敗しました。');
      }
    } finally {
      hideLoading();
    }
  };

  // Google アカウントで登録（未登録ならサーバー側で自動作成してそのままログイン）。
  // メール所有は Google 側で検証済みのため認証コードは不要
  const handleGoogleRegister = async () => {
    try {
      // キャンセル（null）は無通知で画面に留まる
      const result = await googleSignIn();
      if (!result) return;

      showLoading();
      // Register 画面からは未登録ユーザーの自動作成を許可する
      const succeeded = await loginWithGoogle(result.accessToken, 'register');
      if (succeeded) {
        navigation.navigate('HomeTabs');
      }
    } catch (err) {
      console.error('Google register failed:', err);
      Alert.alert('エラー', 'Google アカウントでの登録に失敗しました。');
    } finally {
      hideLoading();
    }
  };

  const headerItems: HeaderToolBarButton[] = [
    { ...HEADER_TOOLBAR_TEMPLATES.back, onPress: handleGoBack },
    {
      ...HEADER_TOOLBAR_TEMPLATES.headerTitle,
      headerTitle: 'REGISTER',
    },
  ];

  const thumbnail = thumbnailUri ? { uri: thumbnailUri } : undefined;

  return (
    <View style={styles.container}>
      <HeaderToolBar items={headerItems} />
      {step === 'form' ? (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
          <ProfileIcon
            thumbnail={thumbnail}
            editable
            onPressUpload={handlePickThumbnail}
          />
          <View style={styles.formContainer}>
            <EditableFormControl
              label="User Name"
              darkMode
              formValue={username}
              onChangeText={setUsername}
              placeholder={PLACEHOLDERS.register.usernameInput}
            />
            <EditableFormControl
              label="Email"
              darkMode
              formValue={email}
              onChangeText={setEmail}
              placeholder={PLACEHOLDERS.register.emailInput}
            />
            <EditableFormControl
              label="Password"
              darkMode
              secureTextEntry
              formValue={password}
              onChangeText={setPassword}
              placeholder={PLACEHOLDERS.register.passwordInput}
            />
          </View>
          <SubmitButton
            containerClassName={styles.submitButton}
            label="CREATE"
            onPress={handleSendCode}
            disabled={!username || !email || !password}
          />
          <View style={styles.dividerContainer}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>OR</Text>
            <View style={styles.dividerLine} />
          </View>
          <Pressable
            style={styles.googleButton}
            onPress={handleGoogleRegister}
            disabled={!googleReady}
            testID="google-register-button"
          >
            <GoogleIcon width={20} height={20} />
            <Text style={styles.googleButtonLabel}>Google で登録</Text>
          </Pressable>
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled">
          <View style={styles.formContainer}>
            <Text style={styles.verifyNotice}>
              {verificationSentNotice('register', email)}
            </Text>
            <EditableFormControl
              key={`code-${codeFieldKey}`}
              label="Verification Code"
              darkMode
              formValue={code}
              onChangeText={setCode}
              placeholder={PLACEHOLDERS.register.codeInput}
              keyboardType="number-pad"
              maxLength={6}
            />
          </View>
          <SubmitButton
            containerClassName={styles.submitButton}
            label="CREATE"
            onPress={handleCreate}
            disabled={code.length !== 6}
          />
          <Pressable
            style={styles.resendButton}
            onPress={handleSendCode}
            disabled={!canResend}
            testID="resend-code-button"
          >
            <Text
              style={[
                styles.resendLabel,
                !canResend && styles.resendLabelDisabled,
              ]}
            >
              {canResend
                ? '認証コードを再送する'
                : `認証コードを再送する（${secondsLeft} 秒後）`}
            </Text>
          </Pressable>
        </ScrollView>
      )}
    </View>
  );
}
