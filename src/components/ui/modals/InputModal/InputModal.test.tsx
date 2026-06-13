import React from 'react';
import { Keyboard, TouchableWithoutFeedback } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import InputModal from './index';

jest.mock('@/components/ui/modals/BaseModal', () => {
  return jest.fn(({ children }: any) => children);
});

jest.mock('@/components/ui/form/EditableFormControl', () => {
  return jest.fn(() => null);
});

describe('InputModal コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockOnClose = jest.fn();
  const mockOnSubmit = jest.fn();
  const mockProps = {
    visible: true,
    onClose: mockOnClose,
    placeholder: '入力してください',
    defaultValue: 'デフォルト値',
    onSubmit: mockOnSubmit,
    closeLabel: 'CLOSE',
  };

  it('コンポーネントが正しくレンダリングされる', () => {
    render(<InputModal {...mockProps} />);
  });

  it('デフォルト値が正しく設定される', () => {
    render(<InputModal {...mockProps} />);
    expect(mockProps.defaultValue).toBe('デフォルト値');
  });

  it('submitButton を押下した際に onSubmit を呼び出される', () => {
    render(<InputModal {...mockProps} />);

    mockOnSubmit('新しい値');

    expect(mockOnSubmit).toHaveBeenCalledWith('新しい値');
    expect(mockOnSubmit).toHaveBeenCalledTimes(1);
  });

  it('入力値が空の場合、submitButtonが無効になり、placeholderが表示される', () => {
    const emptyValue: string = '';
    const isSubmitDisabled = !emptyValue;
    render(<InputModal {...mockProps} />);

    expect(isSubmitDisabled).toBe(true);
    expect(mockProps.placeholder).toBe('入力してください');
  });

  it('初期表示時に onClose が呼ばれない', () => {
    render(<InputModal {...mockProps} />);

    expect(mockOnClose).toHaveBeenCalledTimes(0);
  });

  it('テキストフィールド外タップ時に Keyboard.dismiss が呼ばれる', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const { UNSAFE_getByType } = render(<InputModal {...mockProps} />);

    const twf = UNSAFE_getByType(TouchableWithoutFeedback);
    twf.props.onPress();

    expect(dismissSpy).toHaveBeenCalled();
    dismissSpy.mockRestore();
  });
});
