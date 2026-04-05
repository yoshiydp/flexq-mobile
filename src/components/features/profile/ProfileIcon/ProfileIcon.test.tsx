import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ProfileIcon from './index';

jest.mock('@/components/ui/Icon', () => {
  const { Text } = require('react-native');
  return jest.fn(({ name }) => <Text>{name}</Text>);
});

describe('ProfileIcon コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockThumbnail = {
    uri: 'http://localhost:3000/images/sample/profile.jpg',
  };

  it('コンポーネントが正しくレンダリングされる（編集不可）', () => {
    render(<ProfileIcon thumbnail={mockThumbnail} editable={false} />);
  });

  it('コンポーネントが正しくレンダリングされる（編集可能）', () => {
    render(<ProfileIcon thumbnail={mockThumbnail} editable />);
  });

  it('アップロードボタンが押されたときに onPressUpload が呼ばれる', () => {
    const mockOnPressUpload = jest.fn();
    const { getByText } = render(
      <ProfileIcon thumbnail={mockThumbnail} editable onPressUpload={mockOnPressUpload} />,
    );

    const uploadButton = getByText('upload').parent;
    fireEvent.press(uploadButton);
    expect(mockOnPressUpload).toHaveBeenCalledTimes(1);
  });

  it('thumbnail が未指定のときもレンダリングされる', () => {
    render(<ProfileIcon editable={false} />);
  });
});
