import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import DraftsAddList from './index';

jest.mock('@/components/features/drafts/DraftsAddItem', () => {
  return jest.fn(
    ({
      addButtonLabel,
      listButtonLabel,
      onPressAddButton,
      onPressListButton,
      showListButton = true,
      addButtonTestID,
    }) => {
      const { Text, View, Pressable } = require('react-native');
      return (
        <View>
          <Pressable onPress={onPressAddButton} testID={addButtonTestID}>
            <Text>{addButtonLabel}</Text>
          </Pressable>
          {showListButton && (
            <Pressable onPress={onPressListButton}>
              <Text>{listButtonLabel}</Text>
            </Pressable>
          )}
        </View>
      );
    },
  );
});

describe('DraftsAddList コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockAddItems = [
    {
      addButtonLabel: 'Add Draft 1',
      listButtonLabel: 'List Drafts 1',
      onPressAddButton: jest.fn(),
      onPressListButton: jest.fn(),
    },
    {
      addButtonLabel: 'Add Draft 2',
      listButtonLabel: 'List Drafts 2',
      onPressAddButton: jest.fn(),
      onPressListButton: jest.fn(),
    },
  ];

  it('コンポーネントが正しくレンダリングされる', () => {
    render(<DraftsAddList addItems={mockAddItems} startAnimation />);
  });

  it('各 AddItem の Add ボタンを押したときに対応する onPressAddButton が呼び出される', () => {
    const { getByText } = render(
      <DraftsAddList addItems={mockAddItems} startAnimation />,
    );

    mockAddItems.forEach((item) => {
      const addButtonLabel = getByText(item.addButtonLabel);
      fireEvent.press(addButtonLabel);

      expect(item.onPressAddButton).toHaveBeenCalledTimes(1);
    });
  });

  it('各 AddItem の List ボタンを押したときに対応する onPressListButton が呼び出される', () => {
    const { getByText } = render(
      <DraftsAddList addItems={mockAddItems} startAnimation />,
    );

    mockAddItems.forEach((item) => {
      const listButtonLabel = getByText(item.listButtonLabel);
      fireEvent.press(listButtonLabel);

      expect(item.onPressListButton).toHaveBeenCalledTimes(1);
    });
  });

  it('showListButton={false} のアイテムは List ボタンが表示されない', () => {
    const items = [
      {
        addButtonLabel: 'Add Draft 1',
        listButtonLabel: 'List Drafts 1',
        onPressAddButton: jest.fn(),
        onPressListButton: jest.fn(),
        showListButton: false,
      },
    ];
    const { queryByText } = render(
      <DraftsAddList addItems={items} startAnimation />,
    );

    expect(queryByText('List Drafts 1')).toBeNull();
  });

  it('addButtonTestID が各 DraftsAddItem に渡される', () => {
    const items = [
      {
        addButtonLabel: 'Add Draft 1',
        listButtonLabel: 'List Drafts 1',
        onPressAddButton: jest.fn(),
        onPressListButton: jest.fn(),
        addButtonTestID: 'drafts-quick-memo-button',
      },
      {
        addButtonLabel: 'Add Draft 2',
        listButtonLabel: 'List Drafts 2',
        onPressAddButton: jest.fn(),
        onPressListButton: jest.fn(),
        addButtonTestID: 'drafts-quick-record-button',
      },
    ];
    const { getByTestId } = render(
      <DraftsAddList addItems={items} startAnimation />,
    );

    expect(getByTestId('drafts-quick-memo-button')).toBeTruthy();
    expect(getByTestId('drafts-quick-record-button')).toBeTruthy();
  });
});
