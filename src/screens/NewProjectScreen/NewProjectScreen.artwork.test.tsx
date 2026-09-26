/**
 * NewProjectScreen のアートワーク保存のテスト (TASK-122)
 *
 * 「FROM TRACK LIST」で既存トラックを選んだ場合も、CHANGE ARTWORK で選んだ画像が
 * S3 にアップロードされ artworkKey としてプロジェクトに保存されることを検証する。
 * 修正前はアップロード処理が「UPLOAD NEW」の分岐の中にしかなく、この経路では
 * 画像が保存されずデフォルト画像になっていた。
 */
import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { DefaultService } from '@/apiClient/services/DefaultService';
import { readId3Artwork } from '@/utils/readId3Artwork';
import NewProjectScreen from './index';

let mockNavigation: any = {};
let mockModal: any = {};
let mockTracks: any[] = [];

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => mockNavigation,
}));

jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('expo-image-picker', () => ({ launchImageLibraryAsync: jest.fn() }));

jest.mock('expo-file-system/legacy', () => ({
  cacheDirectory: 'file:///cache/',
  downloadAsync: jest.fn().mockResolvedValue({ uri: 'file:///cache/temp.mp3' }),
}));

jest.mock('@/contexts/ModalContext', () => ({
  useModal: () => mockModal,
}));

jest.mock('@/hooks/useFetchTrack', () => ({
  useFetchTrack: () => ({ tracks: mockTracks }),
}));

jest.mock('@/hooks/useBlockAndroidBackGesture', () => ({
  useBlockAndroidBackGesture: jest.fn(),
}));

jest.mock('@/utils/readId3Artwork', () => ({
  readId3Artwork: jest.fn().mockResolvedValue(null),
}));

jest.mock('@/utils/generateWaveform', () => ({
  generateWaveform: jest.fn().mockResolvedValue([1, 2, 3]),
}));

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: {
    getTrackUploadUrl: jest.fn(),
    createTrack: jest.fn(),
    createProject: jest.fn(),
  },
}));

const existingTrack = (overrides: any = {}) => ({
  id: 'track-1',
  title: 'Track A',
  source: 'https://s3/track-a.mp3',
  artwork: 'https://s3/track-a-artwork.jpg?X-Amz-Signature=abc',
  linkedProjects: [],
  extention: 'MP3',
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  ...overrides,
});

/** getTrackUploadUrl の呼び出しのうち、アートワーク（artwork.*）の分だけを返す */
const artworkUploadCalls = () =>
  (DefaultService.getTrackUploadUrl as jest.Mock).mock.calls.filter(
    ([filename]: any[]) => String(filename).startsWith('artwork.'),
  );

/** S3 への PUT のうち、アートワークの署名付き URL 宛の分だけを返す */
const artworkPutCalls = () =>
  (globalThis.fetch as jest.Mock).mock.calls.filter(
    ([url, init]: any[]) =>
      init?.method === 'PUT' && String(url).includes('upload-artwork'),
  );

const enterTitleAndCreate = async (utils: any) => {
  fireEvent.changeText(
    utils.getByPlaceholderText('プロジェクト名を入力してください'),
    'New Project',
  );
  await act(async () => {
    fireEvent.press(utils.getByTestId('new-project-create-button'));
  });
};

const selectExistingTrack = async (utils: any) => {
  await act(async () => {
    fireEvent.press(utils.getByText('FROM TRACK LIST'));
  });
  await act(async () => {
    fireEvent.press(utils.getByText('Track A'));
  });
};

const pickArtwork = async (utils: any) => {
  await act(async () => {
    fireEvent.press(utils.getByText('CHANGE ARTWORK'));
  });
};

describe('NewProjectScreen のアートワーク保存', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});

    mockNavigation = { goBack: jest.fn(), replace: jest.fn() };
    mockModal = { showLoading: jest.fn(), hideLoading: jest.fn() };
    mockTracks = [existingTrack()];

    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked-artwork.jpg' }],
    });
    (readId3Artwork as jest.Mock).mockResolvedValue(null);

    (DefaultService.getTrackUploadUrl as jest.Mock).mockImplementation(
      async (filename: string) => {
        if (filename.startsWith('artwork.')) {
          return {
            uploadUrl: 'https://s3/upload-artwork',
            key: 'artworks/user-1/new-artwork.jpg',
          };
        }
        if (filename === 'waveform.json') {
          return {
            uploadUrl: 'https://s3/upload-waveform',
            key: 'waveforms/user-1/new.json',
          };
        }
        return {
          uploadUrl: 'https://s3/upload-audio',
          key: 'tracks/user-1/new.mp3',
        };
      },
    );
    (DefaultService.createTrack as jest.Mock).mockResolvedValue({
      id: 'track-new',
      title: 'New Project',
    });
    (DefaultService.createProject as jest.Mock).mockResolvedValue({
      id: 'project-1',
    });

    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      blob: jest.fn().mockResolvedValue('blob-data'),
    }) as any;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('既存トラックを選んだ場合でも、選んだ画像をアップロードして artworkKey を保存する', async () => {
    const utils = render(<NewProjectScreen />);

    await selectExistingTrack(utils);
    await pickArtwork(utils);
    await enterTitleAndCreate(utils);

    await waitFor(() => {
      expect(DefaultService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          projectName: 'New Project',
          trackId: 'track-1',
          artworkKey: 'artworks/user-1/new-artwork.jpg',
        }),
      );
    });

    expect(artworkUploadCalls()).toEqual([['artwork.jpg', 'image/jpeg']]);
    expect(artworkPutCalls()).toHaveLength(1);
    // 既存トラックは他プロジェクトと共有され得るため、トラック側は更新しない
    expect(DefaultService.createTrack).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('既存トラックのアートワークをそのまま使う場合は再アップロードしない', async () => {
    const utils = render(<NewProjectScreen />);

    await selectExistingTrack(utils);
    await enterTitleAndCreate(utils);

    await waitFor(() => {
      expect(DefaultService.createProject).toHaveBeenCalledTimes(1);
    });

    // artworkKey なしで保存し、サーバー側のトラック artworkKey フォールバックに任せる
    expect(DefaultService.createProject).toHaveBeenCalledWith(
      expect.not.objectContaining({ artworkKey: expect.anything() }),
    );
    expect(artworkUploadCalls()).toHaveLength(0);
    expect(artworkPutCalls()).toHaveLength(0);
  });

  it('新規音源アップロード時は、プロジェクトと新規トラックの両方に artworkKey を設定する', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///song.mp3', name: 'song.mp3' }],
    });
    const utils = render(<NewProjectScreen />);

    await act(async () => {
      fireEvent.press(utils.getByText('UPLOAD NEW'));
    });
    await pickArtwork(utils);
    await enterTitleAndCreate(utils);

    await waitFor(() => {
      expect(DefaultService.createProject).toHaveBeenCalledWith(
        expect.objectContaining({
          artworkKey: 'artworks/user-1/new-artwork.jpg',
        }),
      );
    });

    expect(DefaultService.createTrack).toHaveBeenCalledWith(
      expect.objectContaining({
        s3Key: 'tracks/user-1/new.mp3',
        artworkKey: 'artworks/user-1/new-artwork.jpg',
      }),
    );
    expect(artworkUploadCalls()).toEqual([['artwork.jpg', 'image/jpeg']]);
  });

  it('ID3 から取得した PNG のアートワークは png としてアップロードする', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///song.mp3', name: 'song.mp3' }],
    });
    (readId3Artwork as jest.Mock).mockResolvedValue(
      'data:image/png;base64,aGVsbG8=',
    );
    const utils = render(<NewProjectScreen />);

    await act(async () => {
      fireEvent.press(utils.getByText('UPLOAD NEW'));
    });
    await enterTitleAndCreate(utils);

    await waitFor(() => {
      expect(DefaultService.createProject).toHaveBeenCalledTimes(1);
    });

    expect(artworkUploadCalls()).toEqual([['artwork.png', 'image/png']]);
  });

  it('ImagePicker が webp を返した場合も jpg として受け付ける', async () => {
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///picked-artwork.webp' }],
    });
    const utils = render(<NewProjectScreen />);

    await selectExistingTrack(utils);
    await pickArtwork(utils);
    await enterTitleAndCreate(utils);

    await waitFor(() => {
      expect(DefaultService.createProject).toHaveBeenCalledTimes(1);
    });

    // get-track-upload-url は jpg / jpeg / png のみ受け付ける
    expect(artworkUploadCalls()).toEqual([['artwork.jpg', 'image/jpeg']]);
  });

  it('アートワークの PUT が失敗した場合はプロジェクトを作成せずエラーを表示する', async () => {
    (globalThis.fetch as jest.Mock).mockImplementation(async (url: string, init: any) => {
      if (init?.method === 'PUT' && String(url).includes('upload-artwork')) {
        return { ok: false, status: 403 };
      }
      return {
        ok: true,
        status: 200,
        blob: jest.fn().mockResolvedValue('blob-data'),
      };
    });
    const utils = render(<NewProjectScreen />);

    await selectExistingTrack(utils);
    await pickArtwork(utils);
    await enterTitleAndCreate(utils);

    await waitFor(() => {
      expect(Alert.alert).toHaveBeenCalledWith(
        'エラー',
        'プロジェクトの作成に失敗しました。',
      );
    });

    expect(DefaultService.createProject).not.toHaveBeenCalled();
    expect(mockNavigation.replace).not.toHaveBeenCalled();
    expect(mockModal.hideLoading).toHaveBeenCalledTimes(1);
  });
});
