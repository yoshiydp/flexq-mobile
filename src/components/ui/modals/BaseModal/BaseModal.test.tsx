import React from 'react';
import { render } from '@testing-library/react-native';
import BaseModal from './index';

jest.mock('@/components/ui/buttons/CancelButton', () => {
  return jest.fn(() => null);
});

jest.mock('@/components/ui/buttons/SubmitButton', () => {
  return jest.fn(() => null);
});

describe('BaseModal コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const { Text } = require('react-native');
  const mockOnClose = jest.fn();

  it('コンポーネントが正しくレンダリングされる', () => {
    render(
      <BaseModal visible onClose={mockOnClose}>
        <Text>モーダルコンテンツ</Text>
      </BaseModal>,
    );
  });

  it('closeLabel と submitButton が渡された場合、両方のボタンがレンダリングされる', () => {
    const mockCloseLabel = 'NO';
    const mockSubmitButton = {
      label: 'OK',
      onPress: jest.fn(),
    };

    render(
      <BaseModal
        visible
        onClose={mockOnClose}
        closeLabel={mockCloseLabel}
        submitButton={mockSubmitButton}
      >
        <Text>モーダルコンテンツ</Text>
      </BaseModal>,
    );
  });

  it('初期表示時に onClose が呼ばれない', () => {
    render(
      <BaseModal visible onClose={mockOnClose}>
        <Text>モーダルコンテンツ</Text>
      </BaseModal>,
    );

    expect(mockOnClose).toHaveBeenCalledTimes(0);
  });
});
