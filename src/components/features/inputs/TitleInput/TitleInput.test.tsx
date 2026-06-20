import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import TitleInput from './index';

describe('TitleInput コンポーネント', () => {
  const mockProps = {
    value: 'サンプルタイトル',
    onChangeText: jest.fn(),
  };

  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByPlaceholderText } = render(<TitleInput {...mockProps} />);
    const input = getByPlaceholderText('タイトルを入力してください');
    expect(input.props.value).toBe('サンプルタイトル');
  });

  it('テキストが変更されたら onChangeText が呼ばれる', () => {
    const { getByPlaceholderText } = render(<TitleInput {...mockProps} />);
    const input = getByPlaceholderText('タイトルを入力してください');

    fireEvent.changeText(input, '新しいタイトル');
    expect(mockProps.onChangeText).toHaveBeenCalledWith('新しいタイトル');
  });

  it('フォーカス時に onFocus が呼ばれる', () => {
    const mockOnFocus = jest.fn();
    const { getByPlaceholderText } = render(
      <TitleInput {...mockProps} onFocus={mockOnFocus} />,
    );
    const input = getByPlaceholderText('タイトルを入力してください');

    fireEvent(input, 'focus');
    expect(mockOnFocus).toHaveBeenCalledTimes(1);
  });

  it('onFocus が渡されなくてもエラーにならない', () => {
    const { getByPlaceholderText } = render(<TitleInput {...mockProps} />);
    const input = getByPlaceholderText('タイトルを入力してください');

    expect(() => fireEvent(input, 'focus')).not.toThrow();
  });

  it('ブラー時に onBlur が呼ばれる', () => {
    const mockOnBlur = jest.fn();
    const { getByPlaceholderText } = render(
      <TitleInput {...mockProps} onBlur={mockOnBlur} />,
    );
    const input = getByPlaceholderText('タイトルを入力してください');

    fireEvent(input, 'blur');
    expect(mockOnBlur).toHaveBeenCalledTimes(1);
  });

  it('onBlur が渡されなくてもエラーにならない', () => {
    const { getByPlaceholderText } = render(<TitleInput {...mockProps} />);
    const input = getByPlaceholderText('タイトルを入力してください');

    expect(() => fireEvent(input, 'blur')).not.toThrow();
  });
});
