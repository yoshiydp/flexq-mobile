import React from 'react';
import { Keyboard } from 'react-native';
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

  it('Android の edge-to-edge 用にステータスバー・ナビゲーションバーを覆う設定になっている', () => {
    const { Modal } = require('react-native');
    const { UNSAFE_getByType } = render(
      <BaseModal visible onClose={mockOnClose}>
        <Text>モーダルコンテンツ</Text>
      </BaseModal>,
    );

    const modal = UNSAFE_getByType(Modal);
    expect(modal.props.statusBarTranslucent).toBe(true);
    expect(modal.props.navigationBarTranslucent).toBe(true);
  });

  it('モーダルコンテナタップ時に Keyboard.dismiss が呼ばれる', () => {
    const dismissSpy = jest.spyOn(Keyboard, 'dismiss').mockImplementation(() => {});
    const { UNSAFE_getAllByType } = render(
      <BaseModal visible onClose={mockOnClose}>
        <Text>モーダルコンテンツ</Text>
      </BaseModal>,
    );

    const { View } = require('react-native');
    const views = UNSAFE_getAllByType(View);
    const container = views.find((v: any) => v.props.onStartShouldSetResponder);
    container?.props.onStartShouldSetResponder();

    expect(dismissSpy).toHaveBeenCalled();
    dismissSpy.mockRestore();
  });
});
