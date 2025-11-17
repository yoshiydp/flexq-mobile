import React from 'react';
import { render } from '@testing-library/react-native';
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

  it('リンク解除ボタンが押されたときに onPressRemoveLink が呼ばれる', () => {
    const { getByTestId } = render(
      <ProfileEditSocialAccountBox
        socialIcon={mockIcon}
        username="test user"
        isLinked
        onPressRemoveLink={mockOnPressRemoveLink}
        onPressLinkAccount={mockOnPressLinkAccount}
      />,
    );

    const removeLinkButton = getByTestId('remove-link-button');
    removeLinkButton.props.onPress();

    expect(mockOnPressRemoveLink).toHaveBeenCalled();
  });

  it('アカウントリンクボタンが押されたときに onPressLinkAccount が呼ばれる', () => {
    const { getByTestId } = render(
      <ProfileEditSocialAccountBox
        socialIcon={mockIcon}
        username="test user"
        isLinked={false}
        onPressRemoveLink={mockOnPressRemoveLink}
        onPressLinkAccount={mockOnPressLinkAccount}
      />,
    );

    const linkAccountButton = getByTestId('link-account-button');
    linkAccountButton.props.onPress();

    expect(mockOnPressLinkAccount).toHaveBeenCalled();
  });
});
