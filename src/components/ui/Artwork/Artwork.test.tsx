import React from 'react';
import { render } from '@testing-library/react-native';
import Artwork from './index';

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
});
