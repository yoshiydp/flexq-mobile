import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ErrorBanner from './index';
import { FETCH_ERROR_MESSAGES } from '@/constants/messages';

describe('ErrorBanner コンポーネント', () => {
  it('error が無い場合は何も表示しない', () => {
    const { queryByTestId } = render(<ErrorBanner error={null} />);

    expect(queryByTestId('error-banner')).toBeNull();
  });

  it('通信エラー時は接続確認を促す文言を表示する', () => {
    const { getByText } = render(
      <ErrorBanner error={new TypeError('Network request failed')} />,
    );

    expect(getByText(FETCH_ERROR_MESSAGES.offline)).toBeTruthy();
  });

  it('サーバーエラー時は取得失敗の文言を表示する', () => {
    const { getByText } = render(
      <ErrorBanner error={{ status: 500, message: 'Internal Server Error' }} />,
    );

    expect(getByText(FETCH_ERROR_MESSAGES.failed)).toBeTruthy();
  });

  it('onRetry を渡すと再試行ボタンが表示されタップで呼ばれる', () => {
    const onRetry = jest.fn();
    const { getByTestId } = render(
      <ErrorBanner error={new Error('failed')} onRetry={onRetry} />,
    );

    fireEvent.press(getByTestId('error-banner-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('onRetry が無い場合は再試行ボタンを出さない', () => {
    const { queryByTestId } = render(<ErrorBanner error={new Error('x')} />);

    expect(queryByTestId('error-banner-retry')).toBeNull();
  });
});
