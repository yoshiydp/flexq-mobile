import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import TrackAddSheet from './index';

jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(),
}));

const mockLaunchImageLibrary =
  ImagePicker.launchImageLibraryAsync as jest.MockedFunction<
    typeof ImagePicker.launchImageLibraryAsync
  >;

const audioWithoutArtwork = {
  uri: 'file:///tmp/my_song.mp3',
  name: 'my_song.mp3',
  ext: 'mp3',
  contentType: 'audio/mpeg',
  artworkDataUri: null,
};

const audioWithArtwork = {
  ...audioWithoutArtwork,
  artworkDataUri: 'data:image/jpeg;base64,AAAA',
};

describe('TrackAddSheet', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('ファイル名をタイトルの初期値にし、拡張子を表示する', () => {
    const { getByTestId, getByText } = render(
      <TrackAddSheet
        visible
        audio={audioWithoutArtwork}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(getByTestId('track-add-title-input').props.value).toBe('my_song');
    expect(getByText('my_song.mp3')).toBeTruthy();
    expect(getByText('MP3')).toBeTruthy();
  });

  it('mp3 推奨の注記を表示する', () => {
    const { getByTestId, getByText } = render(
      <TrackAddSheet
        visible
        audio={audioWithoutArtwork}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(getByTestId('track-add-format-hint')).toBeTruthy();
    expect(
      getByText(
        'mp3 推奨（wav はファイルサイズが大きくアップロードに時間がかかります）',
      ),
    ).toBeTruthy();
  });

  it('ID3 にアートワークがない場合でも写真ライブラリを自動で開かない', () => {
    render(
      <TrackAddSheet
        visible
        audio={audioWithoutArtwork}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(mockLaunchImageLibrary).not.toHaveBeenCalled();
  });

  it('アートワーク未設定のまま追加できる', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <TrackAddSheet
        visible
        audio={audioWithoutArtwork}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.press(getByTestId('track-add-submit-button'));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'my_song',
      artworkUri: null,
      artworkIsDataUri: false,
    });
  });

  it('ID3 のアートワークを初期値として引き継ぐ', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <TrackAddSheet
        visible
        audio={audioWithArtwork}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.press(getByTestId('track-add-submit-button'));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'my_song',
      artworkUri: 'data:image/jpeg;base64,AAAA',
      artworkIsDataUri: true,
    });
  });

  it('アートワークをタップして選択した画像で差し替える', async () => {
    mockLaunchImageLibrary.mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///tmp/picked.png' }],
    } as any);

    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <TrackAddSheet
        visible
        audio={audioWithArtwork}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.press(getByTestId('track-add-artwork-button'));

    await waitFor(() => {
      expect(mockLaunchImageLibrary).toHaveBeenCalled();
    });
    fireEvent.press(getByTestId('track-add-submit-button'));
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'my_song',
      artworkUri: 'file:///tmp/picked.png',
      artworkIsDataUri: false,
    });
  });

  it('画像選択をキャンセルしても元のアートワークを維持する', async () => {
    mockLaunchImageLibrary.mockResolvedValue({ canceled: true } as any);

    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <TrackAddSheet
        visible
        audio={audioWithArtwork}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.press(getByTestId('track-add-artwork-button'));

    await waitFor(() => {
      expect(mockLaunchImageLibrary).toHaveBeenCalled();
    });
    fireEvent.press(getByTestId('track-add-submit-button'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ artworkUri: 'data:image/jpeg;base64,AAAA' }),
    );
  });

  it('REMOVE でアートワークを未設定に戻せる', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <TrackAddSheet
        visible
        audio={audioWithArtwork}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.press(getByTestId('track-add-artwork-remove-button'));
    fireEvent.press(getByTestId('track-add-submit-button'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ artworkUri: null, artworkIsDataUri: false }),
    );
  });

  it('編集したタイトルで追加できる', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <TrackAddSheet
        visible
        audio={audioWithoutArtwork}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.changeText(getByTestId('track-add-title-input'), 'New Title');
    fireEvent.press(getByTestId('track-add-submit-button'));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'New Title' }),
    );
  });

  it('タイトルが空のときは追加できない', () => {
    const onSubmit = jest.fn();
    const { getByTestId } = render(
      <TrackAddSheet
        visible
        audio={audioWithoutArtwork}
        onCancel={jest.fn()}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.changeText(getByTestId('track-add-title-input'), '   ');
    fireEvent.press(getByTestId('track-add-submit-button'));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('閉じるボタンで onCancel が呼ばれる', () => {
    const onCancel = jest.fn();
    const { getByTestId } = render(
      <TrackAddSheet
        visible
        audio={audioWithoutArtwork}
        onCancel={onCancel}
        onSubmit={jest.fn()}
      />,
    );
    fireEvent.press(getByTestId('track-add-close-button'));
    expect(onCancel).toHaveBeenCalled();
  });

  // presentation="inline"（TrackPickerModal の中）は JS アニメーションで開閉する
  it('inline: 閉じるアニメーションの途中で開き直してもシートが閉じない', async () => {
    const props = {
      audio: audioWithoutArtwork,
      presentation: 'inline' as const,
      onCancel: jest.fn(),
      onSubmit: jest.fn(),
    };
    const { getByTestId, rerender } = render(
      <TrackAddSheet visible {...props} />,
    );
    // 閉じる → アニメーション完了前に開き直す
    rerender(<TrackAddSheet visible={false} {...props} />);
    rerender(<TrackAddSheet visible {...props} />);

    // 閉じるアニメーションの完了コールバックでアンマウントされないこと
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(getByTestId('track-add-sheet')).toBeTruthy();
  });

  it('inline: 閉じるアニメーションの完了後に onCancel が呼ばれる', async () => {
    const onCancel = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <TrackAddSheet
        visible
        audio={audioWithoutArtwork}
        presentation="inline"
        onCancel={onCancel}
        onSubmit={jest.fn()}
      />,
    );
    fireEvent.press(getByTestId('track-add-close-button'));

    await waitFor(() => {
      expect(onCancel).toHaveBeenCalled();
    });
    expect(queryByTestId('track-add-sheet')).toBeNull();
  });

  it('audio が未選択のときは何も表示しない', () => {
    const { queryByTestId } = render(
      <TrackAddSheet
        visible
        audio={null}
        onCancel={jest.fn()}
        onSubmit={jest.fn()}
      />,
    );
    expect(queryByTestId('track-add-sheet')).toBeNull();
  });
});
