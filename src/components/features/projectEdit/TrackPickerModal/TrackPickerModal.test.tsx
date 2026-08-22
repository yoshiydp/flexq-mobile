import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import TrackPickerModal from './index';

const mockTrackA = {
  id: 'track-a',
  title: 'Track A',
  source: 'https://example.com/a.mp3',
  artwork: '',
  linkedProjects: [],
  extention: 'MP3',
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

const mockUploadedTrack = {
  id: 'track-new',
  title: 'New Track',
  s3Key: 'tracks/new.mp3',
  extention: 'mp3',
  linkedProjects: [],
  updatedAt: '2026-01-02',
};

const mockRefreshedNewTrack = {
  id: 'track-new',
  title: 'New Track',
  source: 'https://example.com/new.mp3',
  artwork: '',
  linkedProjects: [],
  extention: 'MP3',
  createdAt: new Date('2026-01-02'),
  updatedAt: new Date('2026-01-02'),
};

const mockRefreshTrack = jest.fn();
const mockPickAndUpload = jest.fn();

jest.mock('@/hooks/useFetchTrack', () => ({
  useFetchTrack: () => ({
    tracks: [mockTrackA],
    loading: false,
    error: null,
    refreshTrack: mockRefreshTrack,
  }),
}));

jest.mock('@/hooks/useUploadTrack', () => ({
  useUploadTrack: () => ({
    pickAndUpload: mockPickAndUpload,
    loading: false,
    error: null,
  }),
}));

describe('TrackPickerModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRefreshTrack.mockResolvedValue([mockTrackA]);
  });

  it('既存トラックと UPLOAD NEW TRACK 行を表示する', () => {
    const { getByText, getByTestId } = render(
      <TrackPickerModal visible onClose={jest.fn()} onSelect={jest.fn()} />,
    );
    expect(getByText('SELECT TRACK')).toBeTruthy();
    expect(getByText('Track A')).toBeTruthy();
    expect(getByTestId('upload-new-track-button')).toBeTruthy();
  });

  it('既存トラックをタップすると onSelect に渡される', () => {
    const onSelect = jest.fn();
    const { getByText } = render(
      <TrackPickerModal visible onClose={jest.fn()} onSelect={onSelect} />,
    );
    fireEvent.press(getByText('Track A'));
    expect(onSelect).toHaveBeenCalledWith(mockTrackA);
  });

  it('閉じるボタンで onClose が呼ばれる', () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <TrackPickerModal visible onClose={onClose} onSelect={jest.fn()} />,
    );
    fireEvent.press(getByTestId('track-picker-close-button'));
    expect(onClose).toHaveBeenCalled();
  });

  it('新規アップロード完了後、再取得したトラックが onSelect に渡される', async () => {
    mockPickAndUpload.mockResolvedValue(mockUploadedTrack);
    mockRefreshTrack.mockResolvedValue([mockRefreshedNewTrack, mockTrackA]);

    const onSelect = jest.fn();
    const { getByTestId } = render(
      <TrackPickerModal visible onClose={jest.fn()} onSelect={onSelect} />,
    );
    fireEvent.press(getByTestId('upload-new-track-button'));

    await waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(mockRefreshedNewTrack);
    });
  });

  it('アップロード進行中にモーダルを閉じた場合は onSelect を呼ばない', async () => {
    let resolveUpload: (value: typeof mockUploadedTrack) => void;
    mockPickAndUpload.mockReturnValue(
      new Promise((resolve) => {
        resolveUpload = resolve;
      }),
    );
    mockRefreshTrack.mockResolvedValue([mockRefreshedNewTrack, mockTrackA]);

    const onSelect = jest.fn();
    const { getByTestId, rerender } = render(
      <TrackPickerModal visible onClose={jest.fn()} onSelect={onSelect} />,
    );
    fireEvent.press(getByTestId('upload-new-track-button'));

    // アップロード完了前にモーダルを閉じる
    rerender(
      <TrackPickerModal visible={false} onClose={jest.fn()} onSelect={onSelect} />,
    );
    resolveUpload!(mockUploadedTrack);

    await waitFor(() => {
      expect(mockPickAndUpload).toHaveBeenCalled();
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('ファイル選択をキャンセルした場合は onSelect を呼ばない', async () => {
    mockPickAndUpload.mockResolvedValue(null);

    const onSelect = jest.fn();
    const { getByTestId } = render(
      <TrackPickerModal visible onClose={jest.fn()} onSelect={onSelect} />,
    );
    fireEvent.press(getByTestId('upload-new-track-button'));

    await waitFor(() => {
      expect(mockPickAndUpload).toHaveBeenCalled();
    });
    expect(onSelect).not.toHaveBeenCalled();
  });
});
