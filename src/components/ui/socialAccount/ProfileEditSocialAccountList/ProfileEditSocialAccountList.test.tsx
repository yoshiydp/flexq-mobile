import React from 'react';
import { render } from '@testing-library/react-native';
import ProfileEditSocialAccountList from './index';

jest.mock('@/components/ui/socialAccount/ProfileEditSocialAccountBox', () => {
  return jest.fn(() => null);
});

describe('ProfileEditSocialAccountList コンポーネント', () => {
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
    render(<ProfileEditSocialAccountList socialAccounts={socialAccounts} />);
  });

  it('socialAccounts が表示される', () => {
    render(<ProfileEditSocialAccountList socialAccounts={socialAccounts} />);

    expect(
      require('@/components/ui/socialAccount/ProfileEditSocialAccountBox'),
    ).toHaveBeenCalledTimes(3);
  });
});
