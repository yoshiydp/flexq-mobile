import React from 'react';
import { render } from '@testing-library/react-native';
import HeadphoneIndicator from './index';
import { useHeadphonesConnected } from '@/hooks/useHeadphonesConnected';

jest.mock('@/hooks/useHeadphonesConnected');

const mockUseHeadphonesConnected = useHeadphonesConnected as jest.Mock;

describe('HeadphoneIndicator コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('有線イヤホン接続時は有線アイコンが表示されること', () => {
    mockUseHeadphonesConnected.mockReturnValue('wired');
    const { getByTestId, queryByTestId } = render(<HeadphoneIndicator />);

    getByTestId('headphone-indicator-wired-icon');
    expect(queryByTestId('headphone-indicator-bluetooth-icon')).toBeNull();
  });

  it('Bluetooth イヤホン接続時は Bluetooth アイコンが表示されること', () => {
    mockUseHeadphonesConnected.mockReturnValue('bluetooth');
    const { getByTestId, queryByTestId } = render(<HeadphoneIndicator />);

    getByTestId('headphone-indicator-bluetooth-icon');
    expect(queryByTestId('headphone-indicator-wired-icon')).toBeNull();
  });

  it('未接続（none）の場合は何も表示しないこと', () => {
    mockUseHeadphonesConnected.mockReturnValue('none');
    const { queryByTestId } = render(<HeadphoneIndicator />);

    expect(queryByTestId('headphone-indicator')).toBeNull();
  });

  it('検知不可（null）の場合は何も表示しないこと', () => {
    mockUseHeadphonesConnected.mockReturnValue(null);
    const { queryByTestId } = render(<HeadphoneIndicator />);

    expect(queryByTestId('headphone-indicator')).toBeNull();
  });
});
