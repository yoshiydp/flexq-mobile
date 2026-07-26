import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import SubmitButton from './index';

describe('SubmitButton コンポーネント', () => {
  it('デフォルトの label "SAVE" が表示される', () => {
    const { getByText } = render(<SubmitButton onPress={jest.fn()} />);

    expect(getByText('SAVE')).toBeTruthy();
  });

  it('label を指定した場合、その文字が表示される', () => {
    const { getByText } = render(
      <SubmitButton label="登録する" onPress={jest.fn()} />,
    );

    expect(getByText('登録する')).toBeTruthy();
  });

  it('disabled=false の時、press で onPress が呼ばれる', () => {
    const mockPress = jest.fn();

    const { getByTestId } = render(
      <SubmitButton label="保存" onPress={mockPress} testID="submit-test" />,
    );

    fireEvent.press(getByTestId('submit-test'));
    expect(mockPress).toHaveBeenCalledTimes(1);
  });

  it('disabled=true の時、press しても onPress は呼ばれない', () => {
    const mockPress = jest.fn();

    const { getByTestId } = render(
      <SubmitButton label="保存" onPress={mockPress} disabled={true} />,
    );

    fireEvent.press(getByTestId('submit-button'));
    expect(mockPress).not.toHaveBeenCalled();
  });

  it('disabled=true の時、コンテナに opacity 0.2 が適用される', () => {
    const { getByTestId } = render(
      <SubmitButton onPress={jest.fn()} disabled={true} />,
    );

    expect(getByTestId('submit-button')).toHaveStyle({ opacity: 0.2 });
  });

  it('disabled=true の時、needsOffscreenAlphaCompositing が有効になる（Android でラベルが潰れないようにする）', () => {
    const { getByTestId } = render(
      <SubmitButton onPress={jest.fn()} disabled={true} />,
    );

    expect(
      getByTestId('submit-button').props.needsOffscreenAlphaCompositing,
    ).toBe(true);
  });

  it('disabled=false の時、opacity は適用されず needsOffscreenAlphaCompositing も無効', () => {
    const { getByTestId } = render(<SubmitButton onPress={jest.fn()} />);

    const button = getByTestId('submit-button');
    expect(button).not.toHaveStyle({ opacity: 0.2 });
    expect(button.props.needsOffscreenAlphaCompositing).toBe(false);
  });

  it('testID が省略された場合、デフォルトの "submit-button" が使われる', () => {
    const { getByTestId } = render(<SubmitButton onPress={jest.fn()} />);

    // デフォルト testID = "submit-button"
    expect(getByTestId('submit-button')).toBeTruthy();
  });

  it('testID を指定すると、その値が使われる', () => {
    const { getByTestId } = render(
      <SubmitButton onPress={jest.fn()} testID="custom-submit-button" />,
    );

    expect(getByTestId('custom-submit-button')).toBeTruthy();
  });
});
