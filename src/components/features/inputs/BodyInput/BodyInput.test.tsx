import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import BodyInput from './index';

const mockEditor = {
  toggleBold: jest.fn(),
  toggleItalic: jest.fn(),
  toggleBulletList: jest.fn(),
  toggleOrderedList: jest.fn(),
};

const mockUseEditorContent = jest.fn();

jest.mock('@10play/tentap-editor', () => {
  const { View } = require('react-native');
  return {
    RichText: (props: any) => <View testID="rich-text" {...props} />,
    useEditorContent: (...args: any[]) => mockUseEditorContent(...args),
  };
});

describe('BodyInput コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseEditorContent.mockReturnValue(undefined);
  });

  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByTestId } = render(
      <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} />,
    );
    getByTestId('rich-text');
  });

  it('isEditing=true のときツールバーが表示される', () => {
    const { getByText } = render(
      <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing />,
    );
    getByText('B');
    getByText('I');
    getByText('•');
    getByText('1.');
  });

  it('isEditing=false のときツールバーが表示されない', () => {
    const { queryByText } = render(
      <BodyInput editor={mockEditor as any} onChangeText={jest.fn()} isEditing={false} />,
    );
    expect(queryByText('B')).toBeNull();
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
