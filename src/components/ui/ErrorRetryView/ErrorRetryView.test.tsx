import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ErrorRetryView from './index';
import { FETCH_ERROR_MESSAGES } from '@/constants/messages';

describe('ErrorRetryView コンポーネント', () => {
  it('通信エラー時は文言と補足を表示する', () => {
    const { getByText } = render(
      <ErrorRetryView
        error={new TypeError('Network request failed')}
        onRetry={jest.fn()}
      />,
    );

    expect(getByText(FETCH_ERROR_MESSAGES.offline)).toBeTruthy();
    expect(getByText(FETCH_ERROR_MESSAGES.offlineDescription)).toBeTruthy();
  });

  it('再試行ボタンをタップすると onRetry が呼ばれる', () => {
    const onRetry = jest.fn();
    const { getByTestId } = render(
      <ErrorRetryView error={new Error('failed')} onRetry={onRetry} />,
    );

    fireEvent.press(getByTestId('error-retry-view-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
