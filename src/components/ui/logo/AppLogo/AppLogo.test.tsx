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

  it('width を指定すると縦横比（218:93）を保ったサイズで描画する', () => {
    const FlexQLogo = jest.requireMock('@/assets/images/flexq-logo.svg');
    render(<AppLogo width={109} />);
    expect(FlexQLogo).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: 109, height: 46.5 }),
      undefined,
    );
  });
});
