import React from 'react';
import { render } from '@testing-library/react-native';
import ConfirmModal from './index';

jest.mock('@/components/ui/modals/BaseModal', () => {
  return jest.fn(() => null);
});

describe('ConfirmModal コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockOnClose = jest.fn();
  const mockOnConfirm = jest.fn();
  const mockSubmitButton = { label: 'OK', onPress: mockOnConfirm };
  const mockProps = {
    visible: true,
    onClose: mockOnClose,
    message: '確認メッセージ',
    description: '説明文',
    submitButton: mockSubmitButton,
  };

  it('コンポーネントが正しくレンダリングされる', () => {
    render(<ConfirmModal {...mockProps} />);
  });

  it('submitButton を押下した際にmockOnConfirmが呼ばれる', () => {
    render(<ConfirmModal {...mockProps} />);

    mockSubmitButton.onPress();

    expect(mockOnConfirm).toHaveBeenCalledTimes(1);
  });

  it('初期表示時に onClose が呼ばれない', () => {
    render(<ConfirmModal {...mockProps} />);

    expect(mockOnClose).toHaveBeenCalledTimes(0);
  });
});
