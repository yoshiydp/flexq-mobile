import React from 'react';
import { render } from '@testing-library/react-native';
import LoadingOverlay from './index';

describe('LoadingOverlay コンポーネント', () => {
  it('visible が true の時、ローディングインジケーターが表示される', () => {
    render(<LoadingOverlay visible />);
  });
  it('visible が false の時、何も表示されない', () => {
    render(<LoadingOverlay visible={false} />);
  });
  it('message を渡すと文言が表示される', () => {
    const { getByText } = render(
      <LoadingOverlay visible message="音源データをアップロード中… 42%" />,
    );
    expect(getByText('音源データをアップロード中… 42%')).toBeTruthy();
  });
  it('message 未指定のときは文言を表示しない', () => {
    const { queryByTestId } = render(<LoadingOverlay visible />);
    expect(queryByTestId('loading-overlay-message')).toBeNull();
  });
});
