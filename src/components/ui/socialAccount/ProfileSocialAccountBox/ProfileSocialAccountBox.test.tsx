import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ProfileSocialAccountBox from './index';

jest.mock('@/components/ui/Icon', () => {
  return jest.fn(() => null);
});

describe('ProfileSocialAccountBox コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockIcon = jest.fn();
  const mockOnPressLinkAccount = jest.fn();

  it('コンポーネントが正しくレンダリングされる', () => {
    render(
      <ProfileSocialAccountBox icon={mockIcon} username="test user" isLinked />,
    );
  });

  it('アカウントリンクがされている場合、username が表示される', () => {
    const { getByText, queryByText } = render(
      <ProfileSocialAccountBox icon={mockIcon} username="test user" isLinked />,
    );

    expect(getByText('test user')).toBeTruthy();
    expect(queryByText('Not linked')).toBeNull();
    expect(queryByText('Link Account')).toBeNull();
  });

  it('アカウントリンクがされていない場合、Not linked と Link Account が表示される', () => {
    const { getByText } = render(
      <ProfileSocialAccountBox
        icon={mockIcon}
        username="test user"
        isLinked={false}
      />,
    );

    expect(getByText('Not linked')).toBeTruthy();
    expect(getByText('Link Account')).toBeTruthy();
  });

  it('Link Account ボタンが押されたときに onPressLinkAccount が呼ばれる', () => {
    const { getByText } = render(
      <ProfileSocialAccountBox
        icon={mockIcon}
        username="test user"
        isLinked={false}
        onPressLinkAccount={mockOnPressLinkAccount}
      />,
    );

    fireEvent.press(getByText('Link Account'));

    expect(mockOnPressLinkAccount).toHaveBeenCalledTimes(1);
  });
});
