import React from 'react';
import { render, fireEvent, act, waitFor } from '@testing-library/react-native';
import ActionButtonWithMenu from './index';

jest.mock('@expo/vector-icons', () => ({
  FontAwesome6: ({ name }: { name: string }) => <div>[icon:{name}]</div>,
}));

describe('ActionButtonWithMenu コンポーネントのテスト', () => {
  const mockOnToggle = jest.fn();
  const mockMenuItem1 = jest.fn();
  const mockMenuItem2 = jest.fn();

  const menuItems = [
    { label: 'Edit', onPress: mockMenuItem1 },
    { label: 'Delete', onPress: mockMenuItem2 },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('メニューが閉じているときはボタンのみ表示され、項目は存在しない', async () => {
    const { queryByText, getByRole } = render(
      <ActionButtonWithMenu
        isOpen={false}
        onToggle={mockOnToggle}
        menuItems={menuItems}
      />,
    );

    expect(queryByText('Edit')).toBeNull();
    expect(queryByText('Delete')).toBeNull();

    const toggleButton = getByRole('button');
    await act(async () => {
      fireEvent.press(toggleButton);
    });

    // onToggle が1回呼ばれていることを確認
    expect(mockOnToggle).toHaveBeenCalledTimes(1);
  });

  it('メニューが開いているとき、全ての項目が表示される', async () => {
    const { getByText } = render(
      <ActionButtonWithMenu
        isOpen={true}
        onToggle={mockOnToggle}
        menuItems={menuItems}
      />,
    );

    await waitFor(() => {
      expect(getByText('Edit')).toBeTruthy();
      expect(getByText('Delete')).toBeTruthy();
    });
  });

  it('各メニュー項目を押下すると対応する関数とonToggleが呼ばれる', async () => {
    const { getByText } = render(
      <ActionButtonWithMenu
        isOpen={true}
        onToggle={mockOnToggle}
        menuItems={menuItems}
      />,
    );

    await act(async () => {
      fireEvent.press(getByText('Edit'));
    });

    expect(mockMenuItem1).toHaveBeenCalledTimes(1);
    expect(mockOnToggle).toHaveBeenCalledTimes(1);

    await act(async () => {
      fireEvent.press(getByText('Delete'));
    });

    expect(mockMenuItem2).toHaveBeenCalledTimes(1);
    expect(mockOnToggle).toHaveBeenCalledTimes(2);
  });

  it('非同期の onPress 関数でも問題なく動作する', async () => {
    const asyncMock = jest.fn().mockResolvedValueOnce(true);
    const asyncMenuItems = [{ label: 'Async Action', onPress: asyncMock }];

    const { getByText } = render(
      <ActionButtonWithMenu
        isOpen={true}
        onToggle={mockOnToggle}
        menuItems={asyncMenuItems}
      />,
    );

    // 非同期関数の呼び出しをテスト
    await act(async () => {
      fireEvent.press(getByText('Async Action'));
    });

    // 呼び出しが完了したことを確認
    await waitFor(() => {
      expect(asyncMock).toHaveBeenCalledTimes(1);
    });
  });
});
