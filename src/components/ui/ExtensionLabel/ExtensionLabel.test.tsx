import React from 'react';
import { render } from '@testing-library/react-native';
import ExtensionLabel from './index';

describe('ExtensionLabel コンポーネント', () => {
  it('labelが任意の値で表示される', () => {
    const { getByText } = render(<ExtensionLabel label="MP3" />);

    expect(getByText('MP3')).toBeTruthy();
  });
});
