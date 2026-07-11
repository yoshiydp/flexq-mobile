/**
 * AiCleanupToggle のユニットテスト
 */
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import AiCleanupToggle from './index';
import { SEPARATION_LABELS } from '@/constants/messages';

describe('AiCleanupToggle コンポーネント', () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ラベルとトグルが表示される', () => {
    const { getByText, getByTestId } = render(
      <AiCleanupToggle value={false} onChange={mockOnChange} />,
    );
    expect(getByText(SEPARATION_LABELS.toggleLabel)).toBeTruthy();
    expect(getByTestId('ai-cleanup-toggle')).toBeTruthy();
  });

  it('value がトグルに反映される', () => {
    const { getByTestId } = render(
      <AiCleanupToggle value={true} onChange={mockOnChange} />,
    );
    expect(getByTestId('ai-cleanup-toggle').props.value).toBe(true);
  });

  it('トグル操作で onChange が呼ばれる', () => {
    const { getByTestId } = render(
      <AiCleanupToggle value={false} onChange={mockOnChange} />,
    );
    fireEvent(getByTestId('ai-cleanup-toggle'), 'valueChange', true);
    expect(mockOnChange).toHaveBeenCalledWith(true);
  });
});
