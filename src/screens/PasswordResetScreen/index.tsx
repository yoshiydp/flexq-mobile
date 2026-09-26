import React, { useState } from 'react';
import {
  View,
  Text,
  Alert,
  TouchableWithoutFeedback,
  Keyboard,
  Pressable,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { StackNavigationProp } from '@react-navigation/stack';
import HeaderToolBar from '@/components/ui/HeaderToolBar';
import EditableFormControl from '@/components/ui/form/EditableFormControl';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import { useModal } from '@/contexts/ModalContext';
import { useResendCountdown } from '@/hooks/useResendCountdown';
import {
  HEADER_TOOLBAR_TEMPLATES,
  HeaderToolBarButton,
} from '@/constants/headerToolBarButtons';
import { PLACEHOLDERS } from '@/constants/placeholders';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { verificationCodeFailureMessage } from '@/utils/verificationCode';
import type { RootStackParamList } from '@/navigation/types';
import { useBlockAndroidBackGesture } from '@/hooks/useBlockAndroidBackGesture';
import styles from './PasswordResetScreen.styles';

export default function PasswordResetScreen() {
  const navigation =
    useNavigation<StackNavigationProp<RootStackParamList>>();
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  // 本人確認ステップ（TASK-85）: email で認証コードを送信 → verify でコード + 新パスワードを入力
  const [step, setStep] = useState<'email' | 'verify'>('email');
  const [code, setCode] = useState('');
  // EditableFormControl は内部 state を持つため、再送時は key を変えて
  // 再マウントし、表示中の古いコードをクリアする
  const [codeFieldKey, setCodeFieldKey] = useState(0);
  const { secondsLeft, canResend, start: startResendCountdown } =
    useResendCountdown();
  const { showLoading, hideLoading } = useModal();

  const handleGoBack = () => {
    // 認証コード入力中の戻るはメール入力へ戻す（画面は離脱しない）
    if (step === 'verify') {
      setStep('email');
      setCode('');
      setNewPassword('');
      return;
    }
    navigation.goBack();
  };

  // Android のシステム back ジェスチャー / 戻るボタンをヘッダーの戻るボタンと同じ処理に接続する（TASK-113）
  // 認証コード入力中はメール入力へ戻す
  useBlockAndroidBackGesture(handleGoBack);

  // 登録済みメールアドレス宛に 6 桁の認証コードを送信して検証ステップへ進む
  const handleSendCode = async () => {
    Keyboard.dismiss();
    if (!email) {
      Alert.alert('Error', 'メールアドレスを入力してください。');
      return;
    }

    showLoading();
    try {
      const res = await DefaultService.postDataAuthVerificationCode({
        email,
        purpose: 'reset',
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
      const status = err?.status;
      if (status === 404) {
        Alert.alert('エラー', '該当のメールアドレスが見つかりません。');
      } else if (status === 429) {
        Alert.alert(
          'エラー',
          '認証コードを再送できるまで少しお待ちください。',
        );
      } else {
        Alert.alert(
          'エラー',
          '認証コードの送信に失敗しました。時間をおいて再度お試しください。',
        );
      }
    } finally {
      hideLoading();
    }
  };

  const handlePasswordReset = async () => {
    Keyboard.dismiss();
    if (code.length !== 6 || !newPassword) {
      Alert.alert('Error', '認証コードと新しいパスワードを入力してください。');
      return;
    }

    showLoading();
    try {
      await DefaultService.postDataAuthResetPassword({
        email,
        newPassword,
        code,
      });
    } catch (err: any) {
      const codeMessage = verificationCodeFailureMessage(err?.body?.reason);
      if (codeMessage) {
        Alert.alert('エラー', codeMessage);
      } else if (err?.status === 404) {
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
        {step === 'email' ? (
          <>
            <View style={styles.formContainer}>
              <Text style={styles.notice}>
                登録済みのメールアドレス宛に 6 桁の認証コードを送信します。
              </Text>
              <EditableFormControl
                label="Email"
                darkMode
                formValue={email}
                onChangeText={setEmail}
                placeholder={PLACEHOLDERS.passwordReset.emailInput}
              />
            </View>
            <SubmitButton
              containerClassName={styles.submitButton}
              label="SEND CODE"
              onPress={handleSendCode}
              disabled={!email}
            />
          </>
        ) : (
          <>
            <View style={styles.formContainer}>
              <Text style={styles.notice}>
                {`${email} 宛に 6 桁の認証コードを送信しました。\nコードと新しいパスワードを入力してください。`}
              </Text>
              <EditableFormControl
                key={`code-${codeFieldKey}`}
                label="Verification Code"
                darkMode
                formValue={code}
                onChangeText={setCode}
                placeholder={PLACEHOLDERS.passwordReset.codeInput}
                keyboardType="number-pad"
                maxLength={6}
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
              disabled={code.length !== 6 || !newPassword}
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
          </>
        )}
      </View>
    </TouchableWithoutFeedback>
  );
}
