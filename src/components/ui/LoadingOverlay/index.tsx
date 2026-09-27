import React, { useEffect } from 'react';
import { View, ActivityIndicator, Text, BackHandler } from 'react-native';
import styles from './LoadingOverlay.styles';

interface LoadingOverlayProps {
  visible: boolean;
  /** インジケーターの下に表示する文言（未指定ならテキストなし） */
  message?: string;
}

export default function LoadingOverlay({
  visible,
  message,
}: LoadingOverlayProps) {
  // 表示中は Android のシステム back（ジェスチャー / 戻るボタン）を握りつぶす（TASK-113）。
  // オーバーレイはタッチを遮るだけの View で、ヘッダーの戻るボタンは押せないが
  // システム back は画面側の useBlockAndroidBackGesture(onBack) に届いてしまい、
  // 保存などの処理中に確認モーダルが開く・処理が中断されるのを防ぐ。
  // 表示時に登録するため、画面側のリスナーより後に並んで優先される
  useEffect(() => {
    if (!visible) return;
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => true,
    );
    return () => subscription.remove();
  }, [visible]);

  if (!visible) return null;

  return (
    <View style={styles.overlay}>
      <ActivityIndicator size="large" color={styles.indicator.color} />
      {!!message && (
        <Text style={styles.message} testID="loading-overlay-message">
          {message}
        </Text>
      )}
    </View>
  );
}
