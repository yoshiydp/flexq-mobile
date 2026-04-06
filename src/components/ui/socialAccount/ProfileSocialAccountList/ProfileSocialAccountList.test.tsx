import React from 'react';
import { render } from '@testing-library/react-native';
import ProfileSocialAccountList from './index';
import ProfileSocialAccountBox from '@/components/ui/socialAccount/ProfileSocialAccountBox';

jest.mock('@/components/ui/socialAccount/ProfileSocialAccountBox', () => {
  return jest.fn(() => null);
});

describe('ProfileSocialAccountList コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const socialAccounts = [
    {
      icon: jest.fn(),
      username: 'test user',
      isLinked: true,
    },
    {
      icon: jest.fn(),
      username: 'second user',
      isLinked: false,
    },
    {
      icon: jest.fn(),
      username: 'third user',
      isLinked: true,
    },
  ];

  it('コンポーネントが正しくレンダリングされる', () => {
    render(<ProfileSocialAccountList socialAccounts={socialAccounts} />);
  });

  it('socialAccounts の件数分だけ ProfileSocialAccountBox が表示される', () => {
    render(<ProfileSocialAccountList socialAccounts={socialAccounts} />);

    expect(ProfileSocialAccountBox).toHaveBeenCalledTimes(3);
  });

  it('onPressLinkAccount が各ボックスに渡される', () => {
    const mockOnPressLinkAccount = jest.fn();

    render(
      <ProfileSocialAccountList
        socialAccounts={socialAccounts}
        onPressLinkAccount={mockOnPressLinkAccount}
      />,
    );

    const calls = (ProfileSocialAccountBox as jest.Mock).mock.calls;
    expect(calls[0][0].onPressLinkAccount).toBeDefined();
    expect(calls[1][0].onPressLinkAccount).toBeDefined();
    expect(calls[2][0].onPressLinkAccount).toBeDefined();
  });
});
