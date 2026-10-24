import React from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import styles from './AppleSignInButton.styles';

interface AppleSignInButtonProps {
  /** ログイン画面は SIGN_IN（Apple でサインイン）、新規登録画面は SIGN_UP（Apple で登録） */
  variant: 'signIn' | 'signUp';
  onPress: () => void;
  /** 外側の余白（新規登録画面は Google ボタンと同じ左右 20px） */
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * 「Apple でサインイン」ボタン（TASK-132）
 *
 * 見た目・文言は Apple のヒューマンインターフェイスガイドラインで決められて
 * いるため、自作せず OS 標準のボタン（AppleAuthenticationButton）を使う。
 * 文言は端末の言語に合わせて OS が出す。背景が暗いため白のスタイルにし、
 * 高さと角丸は隣の Google ボタン（SubmitButton と同じ 52px / 8px）に揃える。
 * 表示可否（iOS かつ利用可能）は呼び出し側が useAppleAuth の available で判定する
 */
export default function AppleSignInButton({
  variant,
  onPress,
  style,
  testID,
}: AppleSignInButtonProps) {
  return (
    <View style={[styles.container, style]} testID={testID}>
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={
          variant === 'signIn'
            ? AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN
            : AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP
        }
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
        cornerRadius={8}
        style={styles.button}
        onPress={onPress}
      />
    </View>
  );
}
