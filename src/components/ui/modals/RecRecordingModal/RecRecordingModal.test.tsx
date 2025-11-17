import React from 'react';
import { render } from '@testing-library/react-native';
import RecRecordingModal from './index';
import RecRecordingSection from '@/components/features/record/RecRecordingSection';

jest.mock('@/components/features/record/RecRecordingSection', () => {
  return jest.fn(() => null);
});

describe('RecRecordingModal コンポーネント', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const mockOnClose = jest.fn();
  const mockOnStop = jest.fn();
  const mockProps = {
    visible: true,
    onClose: mockOnClose,
    onStop: mockOnStop,
  };

  it('コンポーネントが正しくレンダリングされる', () => {
    render(<RecRecordingModal {...mockProps} />);
  });

  it('RecRecordingSection の onStop が呼ばれると、親の onStop も呼ばれる', () => {
    render(<RecRecordingModal {...mockProps} />);

    const propsPassed = (RecRecordingSection as jest.Mock).mock.calls[0][0];

    propsPassed.onStop(5000, 'test-file');

    expect(mockOnStop).toHaveBeenCalledWith(5000, 'test-file');
    expect(mockOnStop).toHaveBeenCalledTimes(1);
  });

  it('初期表示時に onClose が呼ばれない', () => {
    render(<RecRecordingModal {...mockProps} />);

    expect(mockOnClose).toHaveBeenCalledTimes(0);
  });
});
