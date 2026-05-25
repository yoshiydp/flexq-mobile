import React, { createRef } from 'react';
import { Platform } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
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

  it('isEditing=true のときツールバーが表示される', () => {
    const { getByTestId } = render(<BodyInput {...mockProps} isEditing />);
    getByTestId('rich-toolbar');
  });

  it('isEditing=false のときツールバーが表示されない', () => {
    const { queryByTestId } = render(<BodyInput {...mockProps} isEditing={false} />);
    expect(queryByTestId('rich-toolbar')).toBeNull();
  });

  it('完了ボタンが存在しない', () => {
    const { queryByText } = render(<BodyInput {...mockProps} isEditing />);
    expect(queryByText('完了')).toBeNull();
  });

  it('onFocus ハンドラーが RichEditor に渡される', () => {
    render(<BodyInput {...mockProps} />);
    const props = mockRichEditor.mock.calls[0][0];
    expect(typeof props.onFocus).toBe('function');
  });

  describe('iOS 先頭文字複製バグ修正（handleFocus + handleChange）', () => {
    let mockSetContent: jest.Mock;
    let mockFocusEditor: jest.Mock;
    let editorRef: React.RefObject<any>;
    let originalOS: typeof Platform.OS;

    beforeEach(() => {
      jest.useFakeTimers();
      originalOS = Platform.OS;
      (Platform as any).OS = 'ios';
      mockSetContent = jest.fn();
      mockFocusEditor = jest.fn();
      editorRef = createRef();
      (editorRef as React.MutableRefObject<any>).current = {
        blurContentEditor: jest.fn(),
        focusContentEditor: mockFocusEditor,
        setContentHTML: mockSetContent,
      };
    });

    afterEach(() => {
      jest.useRealTimers();
      (Platform as any).OS = originalOS;
    });

    const getLastProps = () =>
      mockRichEditor.mock.calls[mockRichEditor.mock.calls.length - 1][0];

    it('空の状態でフォーカス後の onChange で先頭文字重複を除去する', () => {
      const onChangeText = jest.fn();
      const { getByTestId } = render(
        <BodyInput value="" onChangeText={onChangeText} editorRef={editorRef} />,
      );
      getLastProps().onFocus();
      fireEvent(getByTestId('rich-editor'), 'onChange', '<p>aa</p>');
      expect(onChangeText).toHaveBeenCalledWith('<p>a</p>');
      expect(mockSetContent).toHaveBeenCalledWith('<p>a</p>');
    });

    it('複数文字入力で先頭のみ重複している場合も除去する', () => {
      const onChangeText = jest.fn();
      const { getByTestId } = render(
        <BodyInput value="" onChangeText={onChangeText} editorRef={editorRef} />,
      );
      getLastProps().onFocus();
      fireEvent(getByTestId('rich-editor'), 'onChange', '<p>aabc</p>');
      expect(onChangeText).toHaveBeenCalledWith('<p>abc</p>');
    });

    it('重複なしの場合は onChangeText にそのまま渡す', () => {
      const onChangeText = jest.fn();
      const { getByTestId } = render(
        <BodyInput value="" onChangeText={onChangeText} editorRef={editorRef} />,
      );
      getLastProps().onFocus();
      fireEvent(getByTestId('rich-editor'), 'onChange', '<p>a</p>');
      expect(onChangeText).toHaveBeenCalledWith('<p>a</p>');
      expect(mockSetContent).not.toHaveBeenCalled();
    });

    it('空フォーカス後2文字目以降は重複除去しない', () => {
      const onChangeText = jest.fn();
      const { getByTestId } = render(
        <BodyInput value="" onChangeText={onChangeText} editorRef={editorRef} />,
      );
      getLastProps().onFocus();
      const editor = getByTestId('rich-editor');
      fireEvent(editor, 'onChange', '<p>a</p>'); // 1文字目（重複なし）
      fireEvent(editor, 'onChange', '<p>aa</p>'); // 2文字目（意図的な "aa"）
      // 2回目は除去しない
      expect(onChangeText).toHaveBeenLastCalledWith('<p>aa</p>');
    });

    it('コンテンツが空になった後の入力で重複を除去する（フォーカス継続中）', () => {
      const onChangeText = jest.fn();
      const { getByTestId } = render(
        <BodyInput value="テキスト" onChangeText={onChangeText} editorRef={editorRef} />,
      );
      const editor = getByTestId('rich-editor');
      // フォーカスを保ったままコンテンツを全消し
      fireEvent(editor, 'onChange', '<p><br></p>');
      onChangeText.mockClear();
      // 次の入力で重複が発生した場合
      fireEvent(editor, 'onChange', '<p>aa</p>');
      expect(onChangeText).toHaveBeenCalledWith('<p>a</p>');
      expect(mockSetContent).toHaveBeenCalledWith('<p>a</p>');
    });

    it('コンテンツが空になった後、重複なし入力はそのまま渡す', () => {
      const onChangeText = jest.fn();
      const { getByTestId } = render(
        <BodyInput value="テキスト" onChangeText={onChangeText} editorRef={editorRef} />,
      );
      const editor = getByTestId('rich-editor');
      fireEvent(editor, 'onChange', '');
      onChangeText.mockClear();
      fireEvent(editor, 'onChange', '<p>a</p>');
      expect(onChangeText).toHaveBeenCalledWith('<p>a</p>');
      expect(mockSetContent).not.toHaveBeenCalled();
    });

    it('非空の状態でフォーカスした後の onChange は重複除去しない', () => {
      const onChangeText = jest.fn();
      const { getByTestId } = render(
        <BodyInput value="テキスト" onChangeText={onChangeText} editorRef={editorRef} />,
      );
      getLastProps().onFocus(); // 非空なのでフラグはセットされない
      fireEvent(getByTestId('rich-editor'), 'onChange', '<p>aa</p>');
      expect(onChangeText).toHaveBeenCalledWith('<p>aa</p>');
      expect(mockSetContent).not.toHaveBeenCalled();
    });

    it('重複除去後に focusContentEditor が 10ms 後に呼ばれる', () => {
      const onChangeText = jest.fn();
      const { getByTestId } = render(
        <BodyInput value="" onChangeText={onChangeText} editorRef={editorRef} />,
      );
      getLastProps().onFocus();
      fireEvent(getByTestId('rich-editor'), 'onChange', '<p>aa</p>');
      jest.advanceTimersByTime(10);
      expect(mockFocusEditor).toHaveBeenCalledTimes(1);
    });

    it('Android では重複除去しない', () => {
      (Platform as any).OS = 'android';
      const onChangeText = jest.fn();
      const { getByTestId } = render(
        <BodyInput value="" onChangeText={onChangeText} editorRef={editorRef} />,
      );
      getLastProps().onFocus();
      fireEvent(getByTestId('rich-editor'), 'onChange', '<p>aa</p>');
      expect(onChangeText).toHaveBeenCalledWith('<p>aa</p>');
      expect(mockSetContent).not.toHaveBeenCalled();
    });
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
