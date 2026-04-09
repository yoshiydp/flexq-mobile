import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import SettingsTitledContentBox from './index';
import { COLORS } from '@/globalStyles';

describe('SettingsTitledContentBox コンポーネント', () => {
  const mockHeading = 'セクションタイトル';
  const mockChildren = <Text>コンテンツ</Text>;
  const mockContainerStyle = { color: COLORS.accent.goldPrimary };

  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByText } = render(
      <SettingsTitledContentBox
        heading={mockHeading}
        containerStyle={mockContainerStyle}
      >
        {mockChildren}
      </SettingsTitledContentBox>,
    );

    getByText(mockHeading);
  });

  it('headingBadge が渡されたとき、バッジテキストが表示される', () => {
    const { getByText } = render(
      <SettingsTitledContentBox heading={mockHeading} headingBadge="MP3">
        {mockChildren}
      </SettingsTitledContentBox>,
    );

    getByText(mockHeading);
    getByText('MP3');
  });

  it('headingBadge が渡されないとき、バッジは表示されない', () => {
    const { queryByText } = render(
      <SettingsTitledContentBox heading={mockHeading}>
        {mockChildren}
      </SettingsTitledContentBox>,
    );

    expect(queryByText('MP3')).toBeNull();
  });
});
