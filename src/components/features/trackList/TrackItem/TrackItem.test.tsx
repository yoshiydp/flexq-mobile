import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import TrackItem from './index';

jest.mock('@/components/ui/Icon', () => {
  const { Text } = require('react-native');
  return jest.fn(({ name }) => <Text>{name}</Text>);
});

jest.mock('@/components/ui/ExtensionLabel', () => {
  const { Text } = require('react-native');
  return jest.fn(({ label }) => <Text>{label}</Text>);
});

describe('TrackItem コンポーネント', () => {
  const mockProps = {
    title: 'Test Track',
    linkedProjects: ['Project A', 'Project B'],
    extention: 'MP3',
    updatedAt: new Date('2025-01-01T12:00:00Z'),
    onPress: jest.fn(),
    index: 0,
    startAnimation: true,
  };

  it('コンポーネントが正しくレンダリングされること', () => {
    const { getByText } = render(<TrackItem {...mockProps} />);

    getByText('Test Track');
    getByText('link');
    getByText('MP3');
    getByText('2025/1/1 UPLOAD');
  });

  it('onPress が呼ばれること', () => {
    const { getByTestId } = render(<TrackItem {...mockProps} />);
    const pressable = getByTestId('track-item-pressable');

    fireEvent.press(pressable);
    expect(mockProps.onPress).toHaveBeenCalled();
  });
});
