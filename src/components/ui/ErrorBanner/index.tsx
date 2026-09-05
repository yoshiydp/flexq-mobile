import React from 'react';
import { View, Text, Pressable } from 'react-native';
import { getFetchErrorMessage } from '@/utils/networkError';
import { FETCH_ERROR_MESSAGES } from '@/constants/messages';
import styles from './ErrorBanner.styles';

interface ErrorBannerProps {
  /** 取得時に発生したエラー。null / undefined の場合は何も表示しない */
  error: unknown;
  /** 再試行ボタンのハンドラー。未指定の場合はボタンを出さない */
  onRetry?: () => void;
  /** 画面ごとの余白調整用の追加スタイル */
  containerClassName?: any;
  testID?: string;
}

/**
 * 一覧の再取得に失敗したことを知らせる上部バナー（TASK-97 / CM-01）。
 *
 * 取得済みのデータは残したまま通信エラーだけを伝えるため、
 * 画面全体をエラー表示に差し替えず、リストの先頭に重ねて表示する。
 */
export default function ErrorBanner({
  error,
  onRetry,
  containerClassName,
  testID = 'error-banner',
}: ErrorBannerProps) {
  if (!error) return null;

  return (
    <View style={[styles.container, containerClassName]} testID={testID}>
      <Text style={styles.message}>{getFetchErrorMessage(error)}</Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={styles.retryButton}
          testID={`${testID}-retry`}
          accessibilityRole="button"
        >
          <Text style={styles.retryLabel}>{FETCH_ERROR_MESSAGES.retry}</Text>
        </Pressable>
      )}
    </View>
  );
}
