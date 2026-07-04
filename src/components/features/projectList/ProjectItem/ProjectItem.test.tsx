import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import ProjectItem from './index';

jest.mock('@/components/ui/Icon', () => {
  const { Text } = require('react-native');
  return jest.fn(({ name }) => <Text>{name}</Text>);
});

describe('ProjectItem コンポーネント', () => {
  const mockProps = {
    artwork: { uri: 'http://localhost:3000/images/sample/sample-artwork1.jpg' },
    projectName: 'Test Project',
    soundSourceName: 'Test Track',
    updatedAt: new Date('2025-01-01T12:00:00Z'),
    onPress: jest.fn(),
    index: 0,
    startAnimation: true,
  };

  it('コンポーネントが正しくレンダリングされること', () => {
    const { getByText } = render(<ProjectItem {...mockProps} />);

    // TODO: 画像のテストを追加する方法を検討する
    getByText('Test Project');
    getByText('Test Track');
    getByText('2025.01.01 UPDATE');
  });

  it('onPress が呼ばれること', () => {
    const { getByTestId } = render(<ProjectItem {...mockProps} />);
    const pressable = getByTestId('project-item-pressable');

    fireEvent.press(pressable);
    expect(mockProps.onPress).toHaveBeenCalled();
  });

  it('tags が渡されたときタグが表示される', () => {
    const { getByText } = render(
      <ProjectItem {...mockProps} tags={['Hip Hop', 'R&B']} />,
    );
    getByText('Hip Hop, R&B');
  });

  it('tags が渡されないとき、タグは表示されない', () => {
    const { queryByText } = render(<ProjectItem {...mockProps} />);
    expect(queryByText('Hip Hop, R&B')).toBeNull();
  });

  it('画像ロード失敗時（onError）、デフォルト画像にフォールバックする', () => {
    const DEFAULT_ARTWORK = require('@/assets/images/default-artwork.png');
    const { getByTestId } = render(<ProjectItem {...mockProps} />);

    fireEvent(getByTestId('project-item-artwork'), 'error');

    expect(getByTestId('project-item-artwork').props.source).toEqual(DEFAULT_ARTWORK);
  });

  it('エラー後に artwork の uri が変わるとリモート画像の表示を再試行する', () => {
    const { getByTestId, rerender } = render(<ProjectItem {...mockProps} />);

    fireEvent(getByTestId('project-item-artwork'), 'error');

    const newArtwork = { uri: 'https://example.com/refreshed-presigned-url.jpg' };
    rerender(<ProjectItem {...mockProps} artwork={newArtwork} />);

    expect(getByTestId('project-item-artwork').props.source).toEqual(newArtwork);
  });
});
