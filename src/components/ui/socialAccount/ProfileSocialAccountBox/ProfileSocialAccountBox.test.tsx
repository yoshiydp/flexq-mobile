import React from 'react';
import { render } from '@testing-library/react-native';
import ProfileSocialAccountBox from './index';

jest.mock('@/components/ui/Icon', () => {
  return jest.fn(() => null);
});

describe('ProfileSocialAccountBox コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockIcon = jest.fn();

  it('コンポーネントが正しくレンダリングされる', () => {
    render(
      <ProfileSocialAccountBox icon={mockIcon} username="test user" isLinked />,
    );
  });

  it('リンク済みの場合、リンク済み表示がされる', () => {
    const { getByText } = render(
      <ProfileSocialAccountBox icon={mockIcon} username="test user" isLinked />,
    );

    expect(getByText('Linked')).toBeTruthy();
  });

  it('未リンクの場合、リンクボタンが表示される', () => {
    const { getByText } = render(
      <ProfileSocialAccountBox
        icon={mockIcon}
        username="test user"
        isLinked={false}
      />,
    );

    expect(getByText('Link Account')).toBeTruthy();
  });
});
