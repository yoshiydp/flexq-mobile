import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DraftsAddItem from './index';

jest.mock('@/components/features/drafts/DraftsAddButton', () => {
  return jest.fn(({ label, onPress }) => {
    const { Text, Pressable } = require('react-native');
    return (
      <Pressable onPress={onPress}>
        <Text>{label}</Text>
      </Pressable>
    );
  });
});

jest.mock('@/components/ui/buttons/ArrowButton', () => {
  return jest.fn(({ label, onPress, testID }) => {
    const { Text, Pressable } = require('react-native');
    return (
      <Pressable onPress={onPress} testID={testID}>
        <Text>{label}</Text>
      </Pressable>
    );
  });
});

describe('DraftsAddItem コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockAddButtonLabel = 'Add Draft';
  const mockListButtonLabel = 'List Drafts';
  const mockOnPressAddButton = jest.fn();
  const mockOnPressListButton = jest.fn();

  const { Animated } = require('react-native');

  it('コンポーネントが正しくレンダリングされる', () => {
    render(
      <DraftsAddItem
        addButtonLabel={mockAddButtonLabel}
        listButtonLabel={mockListButtonLabel}
        onPressAddButton={mockOnPressAddButton}
        onPressListButton={mockOnPressListButton}
        translateX={new Animated.Value(0)}
        opacity={new Animated.Value(1)}
      />,
    );
  });

  it('Addボタンを押したときに onPressAddButton が呼び出される', () => {
    const { getByText } = render(
      <DraftsAddItem
        addButtonLabel={mockAddButtonLabel}
        listButtonLabel={mockListButtonLabel}
        onPressAddButton={mockOnPressAddButton}
        onPressListButton={mockOnPressListButton}
        translateX={new Animated.Value(0)}
        opacity={new Animated.Value(1)}
      />,
    );

    const addButtonLabel = getByText(mockAddButtonLabel);
    fireEvent.press(addButtonLabel);

    expect(mockOnPressAddButton).toHaveBeenCalledTimes(1);
  });

  it('Listボタンを押したときに onPressListButton が呼び出される', () => {
    const { getByTestId } = render(
      <DraftsAddItem
        addButtonLabel={mockAddButtonLabel}
        listButtonLabel={mockListButtonLabel}
        onPressAddButton={mockOnPressAddButton}
        onPressListButton={mockOnPressListButton}
        translateX={new Animated.Value(0)}
        opacity={new Animated.Value(1)}
      />,
    );

    const listButton = getByTestId('drafts-list-button');
    fireEvent.press(listButton);

    expect(mockOnPressListButton).toHaveBeenCalledTimes(1);
  });

  it('showListButton={false} のとき Listボタンが表示されない', () => {
    const { queryByTestId } = render(
      <DraftsAddItem
        addButtonLabel={mockAddButtonLabel}
        listButtonLabel={mockListButtonLabel}
        onPressAddButton={mockOnPressAddButton}
        onPressListButton={mockOnPressListButton}
        translateX={new Animated.Value(0)}
        opacity={new Animated.Value(1)}
        showListButton={false}
      />,
    );

    expect(queryByTestId('drafts-list-button')).toBeNull();
  });

  it('showListButton={true} のとき Listボタンが表示される', () => {
    const { getByTestId } = render(
      <DraftsAddItem
        addButtonLabel={mockAddButtonLabel}
        listButtonLabel={mockListButtonLabel}
        onPressAddButton={mockOnPressAddButton}
        onPressListButton={mockOnPressListButton}
        translateX={new Animated.Value(0)}
        opacity={new Animated.Value(1)}
        showListButton={true}
      />,
    );

    expect(getByTestId('drafts-list-button')).toBeTruthy();
  });
});
