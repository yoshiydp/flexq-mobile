import React from 'react';
import { render } from '@testing-library/react-native';
import AppLogo from './index';

jest.mock('@/assets/images/flexq-logo.svg', () => {
  return jest.fn(() => null);
});

describe('AppLogo コンポーネント', () => {
  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByTestId } = render(<AppLogo />);
    expect(getByTestId('app-logo')).toBeTruthy();
  });
});
