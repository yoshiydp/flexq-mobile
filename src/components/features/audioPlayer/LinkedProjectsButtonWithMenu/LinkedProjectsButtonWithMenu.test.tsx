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

  const mockProjectItems = [
    { id: '1', name: 'Project 1' },
    { id: '2', name: 'Project 2' },
    { id: '3', name: 'Project 3' },
  ];
  const mockOnToggle = jest.fn();

  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByTestId } = render(
      <LinkedProjectsButtonWithMenu
        projectItems={mockProjectItems}
        isOpen
        onToggle={mockOnToggle}
      />,
    );

    expect(getByTestId('linked-projects-button')).toBeTruthy();
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

    const button = getByTestId('linked-projects-button');
    fireEvent.press(button);

    expect(mockOnToggle).toHaveBeenCalledTimes(1);
  });

  it('isOpen が true のとき、プロジェクト名がメニューに表示される', () => {
    const { getByText } = render(
      <LinkedProjectsButtonWithMenu
        projectItems={mockProjectItems}
        isOpen={true}
        onToggle={mockOnToggle}
      />,
    );

    expect(getByText('Project 1, Project 2, Project 3')).toBeTruthy();
  });

  it('isOpen が false のとき、メニューが表示されない', () => {
    const { queryByText } = render(
      <LinkedProjectsButtonWithMenu
        projectItems={mockProjectItems}
        isOpen={false}
        onToggle={mockOnToggle}
      />,
    );

    expect(queryByText('Project 1, Project 2, Project 3')).toBeNull();
  });
});
