import React from 'react';
import { View, Text } from 'react-native';
import SubmitButton from '@/components/ui/buttons/SubmitButton';
import {
  getFetchErrorMessage,
  getFetchErrorDescription,
} from '@/utils/networkError';
import { FETCH_ERROR_MESSAGES } from '@/constants/messages';
import styles from './ErrorRetryView.styles';

interface ErrorRetryViewProps {
  /** 取得時に発生したエラー */
  error: unknown;
  /** 再試行ボタンのハンドラー */
  onRetry: () => void;
  /** 画面ごとの余白調整用の追加スタイル */
  containerClassName?: any;
  testID?: string;
}

/**
 * 初回取得に失敗して表示できるデータが無いときの空状態（TASK-97 / CM-01）。
 * 原因の説明と再試行ボタンを出し、通信復帰後にその場でやり直せるようにする。
 */
export default function ErrorRetryView({
  error,
  onRetry,
  containerClassName,
  testID = 'error-retry-view',
}: ErrorRetryViewProps) {
  return (
    <View style={[styles.container, containerClassName]} testID={testID}>
      <Text style={styles.message}>{getFetchErrorMessage(error)}</Text>
      <Text style={styles.description}>{getFetchErrorDescription(error)}</Text>
      <SubmitButton
        containerClassName={styles.retryButton}
        label={FETCH_ERROR_MESSAGES.retry}
        onPress={onRetry}
        testID={`${testID}-retry`}
      />
    </View>
  );
}
