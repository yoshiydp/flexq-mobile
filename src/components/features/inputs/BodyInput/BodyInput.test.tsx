import React from 'react';
import { ScrollView } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import BodyInput from './index';

const mockEditor = {
  toggleBold: jest.fn(),
  toggleItalic: jest.fn(),
  toggleUnderline: jest.fn(),
  toggleBulletList: jest.fn(),
  toggleOrderedList: jest.fn(),
  toggleHeading: jest.fn(),
};

const mockUseEditorContent = jest.fn();
const mockUseBridgeState = jest.fn();

jest.mock('@10play/tentap-editor', () => {
  const { View } = require('react-native');
  return {
    RichText: (props: any) => <View testID="rich-text" {...props} />,
    useEditorContent: (...args: any[]) => mockUseEditorContent(...args),
    useBridgeState: (...args: any[]) => mockUseBridgeState(...args),
  };
});

const defaultEditorState = {
  isBoldActive: false,
  isItalicActive: false,
  isUnderlineActive: false,
  isBulletListActive: false,
  isOrderedListActive: false,
  headingLevel: undefined,
};

describe('BodyInput コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseEditorContent.mockReturnValue(undefined);
    mockUseBridgeState.mockReturnValue(defaultEditorState);
  });

  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByTestId } = render(
      <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} />,
    );
    getByTestId('rich-text');
  });

  it('RichText が ScrollView を介さず直接描画される', () => {
    const { UNSAFE_queryAllByType } = render(
      <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} />,
    );
    expect(UNSAFE_queryAllByType(ScrollView)).toHaveLength(0);
  });

  describe('fillContainer プロパティ', () => {
    it('fillContainer=true でも RichText が描画される', () => {
      const { getByTestId } = render(
        <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} fillContainer />,
      );
      getByTestId('rich-text');
    });

    it('fillContainer=false でも RichText が描画される', () => {
      const { getByTestId } = render(
        <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} fillContainer={false} />,
      );
      getByTestId('rich-text');
    });
  });

  it('isEditing=true のときツールバーが表示される', () => {
    const { getByText } = render(
      <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing />,
    );
    getByText('H1');
    getByText('H2');
    getByText('B');
    getByText('I');
    getByText('U');
    getByText('•');
    getByText('1.');
  });

  it('isEditing=false のときツールバーが表示されない', () => {
    const { queryByText } = render(
      <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing={false} />,
    );
    expect(queryByText('B')).toBeNull();
  });

  it('H1 ボタンを押すと editor.toggleHeading(1) が呼ばれる', () => {
    const { getByText } = render(
      <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing />,
    );
    fireEvent.press(getByText('H1'));
    expect(mockEditor.toggleHeading).toHaveBeenCalledWith(1);
  });

  it('H2 ボタンを押すと editor.toggleHeading(2) が呼ばれる', () => {
    const { getByText } = render(
      <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing />,
    );
    fireEvent.press(getByText('H2'));
    expect(mockEditor.toggleHeading).toHaveBeenCalledWith(2);
  });

  it('Bold ボタンを押すと editor.toggleBold が呼ばれる', () => {
    const { getByText } = render(
      <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing />,
    );
    fireEvent.press(getByText('B'));
    expect(mockEditor.toggleBold).toHaveBeenCalledTimes(1);
  });

  it('Italic ボタンを押すと editor.toggleItalic が呼ばれる', () => {
    const { getByText } = render(
      <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing />,
    );
    fireEvent.press(getByText('I'));
    expect(mockEditor.toggleItalic).toHaveBeenCalledTimes(1);
  });

  it('Underline ボタンを押すと editor.toggleUnderline が呼ばれる', () => {
    const { getByText } = render(
      <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing />,
    );
    fireEvent.press(getByText('U'));
    expect(mockEditor.toggleUnderline).toHaveBeenCalledTimes(1);
  });

  it('BulletList ボタンを押すと editor.toggleBulletList が呼ばれる', () => {
    const { getByText } = render(
      <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing />,
    );
    fireEvent.press(getByText('•'));
    expect(mockEditor.toggleBulletList).toHaveBeenCalledTimes(1);
  });

  it('OrderedList ボタンを押すと editor.toggleOrderedList が呼ばれる', () => {
    const { getByText } = render(
      <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing />,
    );
    fireEvent.press(getByText('1.'));
    expect(mockEditor.toggleOrderedList).toHaveBeenCalledTimes(1);
  });

  it('useEditorContent から HTML が返ったとき onChangeText が呼ばれる', () => {
    mockUseEditorContent.mockReturnValue('<p>テスト</p>');
    const onChangeText = jest.fn();
    render(<BodyInput editor={mockEditor as any} onChangeText={onChangeText} />);
    expect(onChangeText).toHaveBeenCalledWith('<p>テスト</p>');
  });

  it('useEditorContent が undefined のとき onChangeText は呼ばれない', () => {
    mockUseEditorContent.mockReturnValue(undefined);
    const onChangeText = jest.fn();
    render(<BodyInput editor={mockEditor as any} onChangeText={onChangeText} />);
    expect(onChangeText).not.toHaveBeenCalled();
  });

  describe('アクティブ状態', () => {
    it('isBoldActive=true のとき B ボタンが表示されている', () => {
      mockUseBridgeState.mockReturnValue({ ...defaultEditorState, isBoldActive: true });
      const { getByText } = render(
        <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing />,
      );
      expect(getByText('B')).toBeTruthy();
    });

    it('isItalicActive=true のとき I ボタンが表示されている', () => {
      mockUseBridgeState.mockReturnValue({ ...defaultEditorState, isItalicActive: true });
      const { getByText } = render(
        <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing />,
      );
      expect(getByText('I')).toBeTruthy();
    });

    it('isUnderlineActive=true のとき U ボタンが表示されている', () => {
      mockUseBridgeState.mockReturnValue({ ...defaultEditorState, isUnderlineActive: true });
      const { getByText } = render(
        <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing />,
      );
      expect(getByText('U')).toBeTruthy();
    });

    it('headingLevel=1 のとき H1 ボタンが表示されている', () => {
      mockUseBridgeState.mockReturnValue({ ...defaultEditorState, headingLevel: 1 });
      const { getByText } = render(
        <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing />,
      );
      expect(getByText('H1')).toBeTruthy();
    });

    it('headingLevel=2 のとき H2 ボタンが表示されている', () => {
      mockUseBridgeState.mockReturnValue({ ...defaultEditorState, headingLevel: 2 });
      const { getByText } = render(
        <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing />,
      );
      expect(getByText('H2')).toBeTruthy();
    });
  });

  describe('マイクボタン', () => {
    it('onMicPress が渡されない場合マイクボタンが表示されない', () => {
      const { queryByLabelText } = render(
        <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing />,
      );
      expect(queryByLabelText('音声入力開始')).toBeNull();
    });

    it('onMicPress が渡された場合マイクボタンが表示される', () => {
      const { getByLabelText } = render(
        <BodyInput
          editor={mockEditor as any}
          onChangeText={jest.fn()}
          isEditing
          onMicPress={jest.fn()}
        />,
      );
      getByLabelText('音声入力開始');
    });

    it('マイクボタンを押すと onMicPress が呼ばれる', () => {
      const mockOnMicPress = jest.fn();
      const { getByLabelText } = render(
        <BodyInput
          editor={mockEditor as any}
          onChangeText={jest.fn()}
          isEditing
          onMicPress={mockOnMicPress}
        />,
      );
      fireEvent.press(getByLabelText('音声入力開始'));
      expect(mockOnMicPress).toHaveBeenCalledTimes(1);
    });

    it('isListening=true のときアクセシビリティラベルが「録音停止」になる', () => {
      const { getByLabelText } = render(
        <BodyInput
          editor={mockEditor as any}
          onChangeText={jest.fn()}
          isEditing
          onMicPress={jest.fn()}
          isListening
        />,
      );
      getByLabelText('録音停止');
    });

    it('isListening=false のときアクセシビリティラベルが「音声入力開始」になる', () => {
      const { getByLabelText } = render(
        <BodyInput
          editor={mockEditor as any}
          onChangeText={jest.fn()}
          isEditing
          onMicPress={jest.fn()}
          isListening={false}
        />,
      );
      getByLabelText('音声入力開始');
    });
  });
});
