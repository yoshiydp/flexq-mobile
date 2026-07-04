import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import Artwork from './index';

const DEFAULT_ARTWORK = require('@/assets/images/default-artwork.png');

jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  const MockedImage = ({ source, style }: any) => (
    <RN.View testID="mocked-image" style={style}>
      {source && <RN.Text>{JSON.stringify(source)}</RN.Text>}
    </RN.View>
  );
  MockedImage.displayName = 'MockedImage';
  RN.Image = MockedImage;
  return RN;
});

describe('Artwork コンポーネント', () => {
  it('artwork に uri がある場合、Image が描画される', () => {
    const mockImage = {
      uri: 'http://localhost:3000/images/sample/profile.jpg',
    };

    const { getByTestId } = render(<Artwork artwork={mockImage} />);

    expect(getByTestId('artwork-image')).toBeTruthy();
  });

  it('artwork が null の場合、デフォルト画像で Image が描画される', () => {
    const { getByTestId } = render(<Artwork artwork={null} />);
    expect(getByTestId('artwork-image')).toBeTruthy();
  });

  it('artwork が undefined の場合、デフォルト画像で Image が描画される', () => {
    const { getByTestId } = render(<Artwork />);
    expect(getByTestId('artwork-image')).toBeTruthy();
  });

  it('artwork に uri が空文字の場合、デフォルト画像で Image が描画される', () => {
    const { getByTestId } = render(<Artwork artwork={{ uri: '' }} />);
    expect(getByTestId('artwork-image')).toBeTruthy();
  });

  it('画像ロード失敗時（onError）、デフォルト画像にフォールバックする', () => {
    const mockImage = { uri: 'https://example.com/expired-presigned-url.jpg' };
    const { getByTestId } = render(<Artwork artwork={mockImage} />);

    fireEvent(getByTestId('artwork-image'), 'error');

    expect(getByTestId('artwork-image').props.source).toEqual(DEFAULT_ARTWORK);
  });

  it('エラー後に artwork の uri が変わるとリモート画像の表示を再試行する', () => {
    const mockImage = { uri: 'https://example.com/expired-presigned-url.jpg' };
    const { getByTestId, rerender } = render(<Artwork artwork={mockImage} />);

    fireEvent(getByTestId('artwork-image'), 'error');
    expect(getByTestId('artwork-image').props.source).toEqual(DEFAULT_ARTWORK);

    const newImage = { uri: 'https://example.com/refreshed-presigned-url.jpg' };
    rerender(<Artwork artwork={newImage} />);

    expect(getByTestId('artwork-image').props.source).toEqual(newImage);
  });
});
