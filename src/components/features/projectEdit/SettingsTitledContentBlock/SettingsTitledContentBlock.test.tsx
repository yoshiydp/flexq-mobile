import React from 'react';
import { Text } from 'react-native';
import { render } from '@testing-library/react-native';
import SettingsTitledContentBlock from './index';

describe('SettingsTitledContentBlock コンポーネント', () => {
  const mockHeading = 'セクションタイトル';
  const mockChildren = <Text>コンテンツ</Text>;

  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByText } = render(
      <SettingsTitledContentBlock heading={mockHeading}>
        {mockChildren}
      </SettingsTitledContentBlock>,
    );

    getByText(mockHeading);
  });
});
