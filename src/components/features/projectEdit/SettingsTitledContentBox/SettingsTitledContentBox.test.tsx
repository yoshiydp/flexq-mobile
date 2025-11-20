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
});
