import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CueButtonList from './index';

jest.mock('@/components/features/projectEdit/CueButton', () => {
  const { Pressable, Text } = require('react-native');
  return jest.fn(({ label, time, onPress }: any) => (
    <Pressable onPress={onPress}>
      <Text>{label}</Text>
      <Text>{time}</Text>
    </Pressable>
  ));
});

describe('CueButtonList コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockCueButtons = [
    { time: 3500, label: 'Intro', isActive: true },
    { time: 0, label: '', isActive: false },
    { time: 0, label: '', isActive: false },
    { time: 0, label: '', isActive: false },
    { time: 0, label: '', isActive: false },
  ];

  const mockOnPress = jest.fn();
  const mockOnLongPress = jest.fn();

  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByText } = render(
      <CueButtonList
        cueButtons={mockCueButtons}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />,
    );
    getByText('Intro');
    getByText('3500');
  });

  it('CueButton が押されたら onPress が呼ばれる', () => {
    const { getByText } = render(
      <CueButtonList
        cueButtons={mockCueButtons}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />,
    );
    const cueButton = getByText('Intro').parent;
    fireEvent.press(cueButton);

    expect(mockOnPress).toHaveBeenCalledTimes(1);
    expect(mockOnPress).toHaveBeenCalledWith(0);
  });

  it('CueButton が長押しされたら onLongPress が呼ばれる', () => {
    const { getByText } = render(
      <CueButtonList
        cueButtons={mockCueButtons}
        onPress={mockOnPress}
        onLongPress={mockOnLongPress}
      />,
    );
    const cueButton = getByText('Intro').parent;
    fireEvent(cueButton, 'longPress');

    expect(mockOnLongPress).toHaveBeenCalledTimes(1);
    expect(mockOnLongPress).toHaveBeenCalledWith(0);
  });
});
