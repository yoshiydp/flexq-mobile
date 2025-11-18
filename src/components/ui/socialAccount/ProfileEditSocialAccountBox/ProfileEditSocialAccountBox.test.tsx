import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ProfileEditSocialAccountBox from './index';

jest.mock('@/components/ui/Icon', () => {
  return jest.fn(() => null);
});

describe('ProfileEditSocialAccountBox コンポーネント', () => {
  const mockIcon = jest.fn();
  const mockOnPressRemoveLink = jest.fn();
  const mockOnPressLinkAccount = jest.fn();

  it('コンポーネントが正しくレンダリングされる', () => {
    render(
      <ProfileEditSocialAccountBox
        socialIcon={mockIcon}
        username="test user"
        isLinked
        onPressRemoveLink={mockOnPressRemoveLink}
        onPressLinkAccount={mockOnPressLinkAccount}
      />,
    );
  });

  it('アカウントリンク解除ボタンが押されたときに onPressRemoveLink が呼ばれる', () => {
    const { getByText } = render(
      <ProfileEditSocialAccountBox
        socialIcon={mockIcon}
        username="test user"
        isLinked
        onPressRemoveLink={mockOnPressRemoveLink}
        onPressLinkAccount={mockOnPressLinkAccount}
      />,
    );

    const removeText = getByText('Remove Link');
    fireEvent.press(removeText.parent);

    expect(mockOnPressRemoveLink).toHaveBeenCalledTimes(1);
  });

  it('アカウントリンクボタンが押されたときに onPressLinkAccount が呼ばれる', () => {
    const { getByText } = render(
      <ProfileEditSocialAccountBox
        socialIcon={mockIcon}
        username="test user"
        isLinked={false}
        onPressRemoveLink={mockOnPressRemoveLink}
        onPressLinkAccount={mockOnPressLinkAccount}
      />,
    );

    const linkAccountText = getByText('Link Account');
    fireEvent.press(linkAccountText.parent);

    expect(mockOnPressLinkAccount).toHaveBeenCalledTimes(1);
  });
});
