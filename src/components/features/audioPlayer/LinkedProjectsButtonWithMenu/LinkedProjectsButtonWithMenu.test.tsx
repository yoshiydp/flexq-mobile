import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import LinkedProjectsButtonWithMenu from './index';

jest.mock('@/components/ui/buttons/RippleButton', () => {
  const { Pressable } = require('react-native');
  return jest.fn(({ children, onPress, testID }) => (
    <Pressable onPress={onPress} testID={testID}>
      {children}
    </Pressable>
  ));
});

jest.mock('@/components/ui/Icon', () => {
  return jest.fn(() => null);
});

describe('LinkedProjectsButtonWithMenu コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockProjectItems = ['Project 1', 'Project 2', 'Project 3'];
  const mockOnToggle = jest.fn();

  it('コンポーネントが正しくレンダリングされる', () => {
    render(
      <LinkedProjectsButtonWithMenu
        projectItems={mockProjectItems}
        isOpen
        onToggle={mockOnToggle}
      />,
    );
  });

  it('初期表示時に onToggle が呼ばれない', () => {
    render(
      <LinkedProjectsButtonWithMenu
        projectItems={mockProjectItems}
        isOpen={false}
        onToggle={mockOnToggle}
      />,
    );

    expect(mockOnToggle).toHaveBeenCalledTimes(0);
  });

  it('ボタンが押されたときに onToggle が呼び出される', () => {
    const { getByTestId } = render(
      <LinkedProjectsButtonWithMenu
        projectItems={mockProjectItems}
        isOpen={false}
        onToggle={mockOnToggle}
      />,
    );

    const button = getByTestId('linked-projects-button'); // ← これで取得できる
    fireEvent.press(button);

    expect(mockOnToggle).toHaveBeenCalledTimes(1);
  });
});
