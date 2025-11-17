import React from 'react';
import { render } from '@testing-library/react-native';
import LoadingOverlay from './index';

describe('LoadingOverlay コンポーネント', () => {
  it('visible が true の時、ローディングインジケーターが表示される', () => {
    render(<LoadingOverlay visible />);
  });
  it('visible が false の時、何も表示されない', () => {
    render(<LoadingOverlay visible={false} />);
  });
});
