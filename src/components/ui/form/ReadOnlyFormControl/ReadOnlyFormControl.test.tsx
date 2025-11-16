import React from 'react';
import { render } from '@testing-library/react-native';
import ReadOnlyFormControl from './index';
import ProfileSocialAccountList from '@/components/ui/socialAccount/ProfileSocialAccountList';

jest.mock('@/components/ui/socialAccount/ProfileSocialAccountList', () => {
  return jest.fn(() => null);
});

describe('ReadOnlyFormControl コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ラベルとフォーム値が表示される', () => {
    render(<ReadOnlyFormControl label="Email" formValue="user@example.com" />);
  });

  it('socialAccounts が表示される', () => {
    const socialAccounts = [
      {
        icon: jest.fn(),
        username: 'testuser',
        isLinked: true,
      },
      {
        icon: jest.fn(),
        username: 'anotheruser',
        isLinked: false,
      },
      {
        icon: jest.fn(),
        username: 'thirduser',
        isLinked: true,
      },
    ];

    render(
      <ReadOnlyFormControl
        label="Social Accounts"
        showSocialAccounts
        socialAccounts={socialAccounts}
      />,
    );

    expect(ProfileSocialAccountList).toHaveBeenCalledTimes(1);

    expect(ProfileSocialAccountList).toHaveBeenCalledWith(
      { socialAccounts },
      undefined,
    );
  });
});
