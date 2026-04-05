import React, { createRef } from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { RichEditor } from 'react-native-pell-rich-editor';
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

  it('完了ボタンを押すと blurContentEditor が呼ばれる', () => {
    const editorRef = createRef<RichEditor>();
    const mockBlur = jest.fn();
    (editorRef as React.MutableRefObject<RichEditor>).current = {
      blurContentEditor: mockBlur,
    } as unknown as RichEditor;

    const { getByText } = render(
      <BodyInput {...mockProps} isEditing editorRef={editorRef} />,
    );

    fireEvent.press(getByText('完了'));
    expect(mockBlur).toHaveBeenCalledTimes(1);
  });
});
