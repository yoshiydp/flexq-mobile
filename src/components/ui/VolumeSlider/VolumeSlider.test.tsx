import React from 'react';
import { render } from '@testing-library/react-native';
import VolumeSlider from './index';

describe('VolumeSlider コンポーネント', () => {
  it('コンポーネントが正しくレンダリングされる', () => {
    render(<VolumeSlider volume={1} onVolumeChange={() => {}} />);
  });
});
