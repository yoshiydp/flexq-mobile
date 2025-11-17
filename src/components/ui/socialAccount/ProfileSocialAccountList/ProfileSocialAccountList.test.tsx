import React from 'react';
import { render } from '@testing-library/react-native';
import ProfileSocialAccountList from './index';

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

  it('socialAccounts が表示される', () => {
    render(<ProfileSocialAccountList socialAccounts={socialAccounts} />);

    expect(
      require('@/components/ui/socialAccount/ProfileSocialAccountBox'),
    ).toHaveBeenCalledTimes(3);
  });
});
