import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import CueButton from './index';

jest.mock('@/utils/formatTime', () => ({
  formatTime: jest.fn(() => '02:05'),
}));

describe('CueButton コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockProps = {
    label: 'Cue A',
    time: 125000,
    onPress: jest.fn(),
    onLongPress: jest.fn(),
  };

  it('アクティブ状態で正しくレンダリングされる', () => {
    const { getByText } = render(<CueButton isActive {...mockProps} />);
    getByText('Cue A');
  });

  it('非アクティブ状態で正しくレンダリングされる', () => {
    const { getByText } = render(<CueButton isActive={false} {...mockProps} />);
    getByText('Cue A');
  });

  it('ボタンが押されたら onPress が呼ばれる', () => {
    const { getByText } = render(<CueButton {...mockProps} />);
    const cueButton = getByText('Cue A').parent;
    fireEvent.press(cueButton);

    expect(mockProps.onPress).toHaveBeenCalledTimes(1);
  });

  it('ボタンが長押しされたら onLongPress が呼ばれる', () => {
    const { getByText } = render(<CueButton {...mockProps} />);
    const cueButton = getByText('Cue A').parent;
    fireEvent(cueButton, 'longPress');

    expect(mockProps.onLongPress).toHaveBeenCalledTimes(1);
  });

  it('time が正しく表示される', () => {
    const { getByText } = render(<CueButton isActive {...mockProps} />);
    getByText('02:05');
  });
});
