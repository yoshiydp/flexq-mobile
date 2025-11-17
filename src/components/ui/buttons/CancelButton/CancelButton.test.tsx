import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CancelButton from './index';

describe('CancelButton コンポーネント', () => {
  it('デフォルトの label "CANCEL" が表示される', () => {
    const { getByText } = render(<CancelButton onPress={jest.fn()} />);

    expect(getByText('CANCEL')).toBeTruthy();
  });

  it('label を指定した場合、そのテキストが表示される', () => {
    const { getByText } = render(
      <CancelButton label="戻る" onPress={jest.fn()} />,
    );

    expect(getByText('戻る')).toBeTruthy();
  });

  it('ボタン押下で onPress が1回呼ばれる', () => {
    const mockOnPress = jest.fn();

    const { getByTestId } = render(
      <CancelButton onPress={mockOnPress} testID="cancel-test-btn" />,
    );

    fireEvent.press(getByTestId('cancel-test-btn'));
    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('testID が指定されない場合、デフォルトの "cancel-button" が使われる', () => {
    const { getByTestId } = render(<CancelButton onPress={jest.fn()} />);

    // デフォルト testID = "cancel-button"
    expect(getByTestId('cancel-button')).toBeTruthy();
  });

  it('testID を指定すれば、その値が使われる', () => {
    const { getByTestId } = render(
      <CancelButton onPress={jest.fn()} testID="custom-cancel-button" />,
    );

    expect(getByTestId('custom-cancel-button')).toBeTruthy();
  });
});
