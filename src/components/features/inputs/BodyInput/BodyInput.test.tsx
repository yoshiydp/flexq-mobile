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
    RichEditor: (props: {
      onChange?: (text: string) => void;
      onFocus?: () => void;
    }) => {
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

  it('onFocus ハンドラーが RichEditor に渡される', () => {
    render(<BodyInput {...mockProps} />);
    const props = mockRichEditor.mock.calls[0][0];
    expect(typeof props.onFocus).toBe('function');
  });

  describe('マイクボタン', () => {
    it('onMicPress が渡されない場合マイクボタンが表示されない', () => {
      const { queryByLabelText } = render(<BodyInput {...mockProps} isEditing />);
      expect(queryByLabelText('音声入力開始')).toBeNull();
    });

    it('onMicPress が渡された場合マイクボタンが表示される', () => {
      const { getByLabelText } = render(
        <BodyInput {...mockProps} isEditing onMicPress={jest.fn()} />,
      );
      getByLabelText('音声入力開始');
    });

    it('マイクボタンを押すと onMicPress が呼ばれる', () => {
      const mockOnMicPress = jest.fn();
      const { getByLabelText } = render(
        <BodyInput {...mockProps} isEditing onMicPress={mockOnMicPress} />,
      );
      fireEvent.press(getByLabelText('音声入力開始'));
      expect(mockOnMicPress).toHaveBeenCalledTimes(1);
    });

    it('isListening=true のときアクセシビリティラベルが「録音停止」になる', () => {
      const { getByLabelText } = render(
        <BodyInput {...mockProps} isEditing onMicPress={jest.fn()} isListening />,
      );
      getByLabelText('録音停止');
    });

    it('isListening=false のときアクセシビリティラベルが「音声入力開始」になる', () => {
      const { getByLabelText } = render(
        <BodyInput
          {...mockProps}
          isEditing
          onMicPress={jest.fn()}
          isListening={false}
        />,
      );
      getByLabelText('音声入力開始');
    });
  });
});
