import React from 'react';
import { render } from '@testing-library/react-native';
import AnimatedAppLogo from './index';

describe('AnimatedAppLogo コンポーネント', () => {
  it('コンポーネントが正しくレンダリングされる', () => {
    render(<AnimatedAppLogo />);
  });
});
