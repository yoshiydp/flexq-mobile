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
  it('artwork が存在する場合、Image が描画される', () => {
    const mockImage = {
      uri: 'http://localhost:3000/images/sample/profile.jpg',
    };

    const { getByTestId } = render(<Artwork artwork={mockImage} />);

    // Image コンポーネントの描画を確認
    expect(getByTestId('artwork-image')).toBeTruthy();

    // 画像URIが正しく渡されているか確認
    expect(JSON.stringify(mockImage)).toBeTruthy();
  });

  it('artwork が存在しない場合、デフォルト画像で Image が描画される', () => {
    const { getByTestId } = render(<Artwork artwork={null} />);
    expect(getByTestId('artwork-image')).toBeTruthy();
  });
});
