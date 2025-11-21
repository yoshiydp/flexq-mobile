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
});
