import React from 'react';
import { Linking } from 'react-native';
import { fireEvent, render } from '@testing-library/react-native';
import HeadphoneIndicator from './index';
import {
  useBluetoothDetectionStatus,
  useHeadphonesConnected,
} from '@/hooks/useHeadphonesConnected';
import { HEADPHONE_LABELS } from '@/constants/messages';

jest.mock('@/hooks/useHeadphonesConnected');

const mockUseHeadphonesConnected = useHeadphonesConnected as jest.Mock;
const mockUseBluetoothDetectionStatus =
  useBluetoothDetectionStatus as jest.Mock;

describe('HeadphoneIndicator コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseBluetoothDetectionStatus.mockReturnValue('not-required');
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
    expect(queryByTestId('headphone-indicator-detection-off')).toBeNull();
  });

  it('検知不可（null）の場合は何も表示しないこと', () => {
    mockUseHeadphonesConnected.mockReturnValue(null);
    const { queryByTestId } = render(<HeadphoneIndicator />);

    expect(queryByTestId('headphone-indicator')).toBeNull();
    expect(queryByTestId('headphone-indicator-detection-off')).toBeNull();
  });

  describe('Bluetooth 検知オフ表示（Android 12+ で権限が未許可 / TASK-115）', () => {
    it('未許可（denied）で未接続なら「Bluetooth 検知オフ」が表示され、タップで端末設定を開くこと', () => {
      const openSettingsSpy = jest
        .spyOn(Linking, 'openSettings')
        .mockResolvedValue(undefined);
      mockUseHeadphonesConnected.mockReturnValue('none');
      mockUseBluetoothDetectionStatus.mockReturnValue('denied');
      const { getByTestId, getByText, queryByTestId } = render(
        <HeadphoneIndicator />,
      );

      getByText(HEADPHONE_LABELS.bluetoothDetectionOff);
      getByTestId('headphone-indicator-detection-off-icon');
      expect(queryByTestId('headphone-indicator')).toBeNull();

      fireEvent.press(getByTestId('headphone-indicator-detection-off'));
      expect(openSettingsSpy).toHaveBeenCalledTimes(1);
      openSettingsSpy.mockRestore();
    });

    it('未許可でも検知結果が届く前（null）なら検知オフを表示すること', () => {
      mockUseHeadphonesConnected.mockReturnValue(null);
      mockUseBluetoothDetectionStatus.mockReturnValue('denied');
      const { getByTestId } = render(<HeadphoneIndicator />);

      getByTestId('headphone-indicator-detection-off');
    });

    it('未許可でも有線イヤホン接続中は有線アイコンを優先すること', () => {
      mockUseHeadphonesConnected.mockReturnValue('wired');
      mockUseBluetoothDetectionStatus.mockReturnValue('denied');
      const { getByTestId, queryByTestId } = render(<HeadphoneIndicator />);

      getByTestId('headphone-indicator-wired-icon');
      expect(queryByTestId('headphone-indicator-detection-off')).toBeNull();
    });

    it.each(['granted', 'unknown', 'not-required'] as const)(
      '権限状態が %s なら未接続時は何も表示しないこと',
      (status) => {
        mockUseHeadphonesConnected.mockReturnValue('none');
        mockUseBluetoothDetectionStatus.mockReturnValue(status);
        const { queryByTestId } = render(<HeadphoneIndicator />);

        expect(queryByTestId('headphone-indicator')).toBeNull();
        expect(queryByTestId('headphone-indicator-detection-off')).toBeNull();
      },
    );
  });
});
