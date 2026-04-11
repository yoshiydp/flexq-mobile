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

  it('trackSource が RecRecordingSection に渡される', () => {
    const trackSource = 'https://example.com/track.mp3';
    render(<RecRecordingModal {...mockProps} trackSource={trackSource} />);

    const propsPassed = (RecRecordingSection as jest.Mock).mock.calls[0][0];
    expect(propsPassed.trackSource).toBe(trackSource);
  });

  it('trackSource が未指定の場合、RecRecordingSection に undefined が渡される', () => {
    render(<RecRecordingModal {...mockProps} />);

    const propsPassed = (RecRecordingSection as jest.Mock).mock.calls[0][0];
    expect(propsPassed.trackSource).toBeUndefined();
  });

  it('lyrics が指定された場合、HTMLタグを除去したテキストが表示される', () => {
    const lyrics = '<p>Verse 1</p><p>Verse 2</p>';
    const { getByText } = render(<RecRecordingModal {...mockProps} lyrics={lyrics} />);
    expect(getByText('Verse 1\nVerse 2')).toBeTruthy();
  });

  it('lyrics が未指定の場合、リリックセクションが表示されない', () => {
    const { queryByText } = render(<RecRecordingModal {...mockProps} />);
    expect(queryByText(/Verse/)).toBeNull();
  });

  it('lyrics が空文字の場合、リリックセクションが表示されない', () => {
    const { queryByText } = render(<RecRecordingModal {...mockProps} lyrics="" />);
    expect(queryByText(/./)).toBeNull();
  });
});
