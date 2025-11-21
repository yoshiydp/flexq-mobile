import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DraftsAddButton from './index';

jest.mock('@/components/ui/Icon', () => {
  return jest.fn(({ name }) => {
    const { Text } = require('react-native');
    return <Text>{name}</Text>;
  });
});

describe('DraftsAddButton コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockOnPress = jest.fn();
  const mockLabel = 'Add Draft';

  it('コンポーネントが正しくレンダリングされる', () => {
    render(<DraftsAddButton label={mockLabel} onPress={mockOnPress} />);
  });

  it('ボタンが押されたときに onPress が呼び出される', () => {
    const { getByText } = render(
      <DraftsAddButton label={mockLabel} onPress={mockOnPress} />,
    );

    const button = getByText(mockLabel).parent;
    fireEvent.press(button);

    expect(mockOnPress).toHaveBeenCalledTimes(1);
  });

  it('ラベルが正しく表示される', () => {
    const { getByText } = render(
      <DraftsAddButton label={mockLabel} onPress={mockOnPress} />,
    );

    getByText(mockLabel);
  });

  it('アイコンが正しく表示される', () => {
    const { getByText } = render(
      <DraftsAddButton label={mockLabel} onPress={mockOnPress} />,
    );

    getByText('plus');
  });
});
