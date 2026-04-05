import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Keyboard } from 'react-native';
import BodyInput from './index';

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return { WebView: View };
});

const mockRichEditor = jest.fn();

jest.mock('react-native-pell-rich-editor', () => {
  const { View } = require('react-native');
  return {
    RichEditor: (props: { onChange?: (text: string) => void; injectedJavaScript?: string }) => {
      mockRichEditor(props);
      return <View testID="rich-editor" onChange={props.onChange} />;
    },
    RichToolbar: () => <View testID="rich-toolbar" />,
    actions: {
      setBold: 'setBold',
      setItalic: 'setItalic',
      insertBulletsList: 'insertBulletsList',
      insertOrderedList: 'insertOrderedList',
    },
  };
});

describe('BodyInput コンポーネント', () => {
  const mockProps = {
    value: 'サンプル本文',
    onChangeText: jest.fn(),
  };

  beforeEach(() => {
    mockRichEditor.mockClear();
  });

  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByTestId } = render(<BodyInput {...mockProps} />);
    getByTestId('rich-editor');
  });

  it('エディタの onChange が呼ばれたら onChangeText が呼ばれる', () => {
    const { getByTestId } = render(<BodyInput {...mockProps} />);
    const editor = getByTestId('rich-editor');

    fireEvent(editor, 'onChange', '新しい本文');
    expect(mockProps.onChangeText).toHaveBeenCalledWith('新しい本文');
  });

  it('isEditing=true のとき完了ボタンが表示される', () => {
    const { getByText } = render(<BodyInput {...mockProps} isEditing />);
    getByText('完了');
  });

  it('isEditing=false のとき完了ボタンが表示されない', () => {
    const { queryByText } = render(<BodyInput {...mockProps} isEditing={false} />);
    expect(queryByText('完了')).toBeNull();
  });

  it('完了ボタンを押すと Keyboard.dismiss が呼ばれる', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss');
    const { getByText } = render(<BodyInput {...mockProps} isEditing />);

    fireEvent.press(getByText('完了'));
    expect(dismissSpy).toHaveBeenCalledTimes(1);

    dismissSpy.mockRestore();
  });

  it('RichEditor に autocapitalize を無効化する injectedJavaScript が渡される', () => {
    render(<BodyInput {...mockProps} />);
    const props = mockRichEditor.mock.calls[0][0];
    expect(props.injectedJavaScript).toContain('autocapitalize');
    expect(props.injectedJavaScript).toContain('none');
  });
});
