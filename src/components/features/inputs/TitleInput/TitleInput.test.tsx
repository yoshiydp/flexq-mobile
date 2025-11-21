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
});
