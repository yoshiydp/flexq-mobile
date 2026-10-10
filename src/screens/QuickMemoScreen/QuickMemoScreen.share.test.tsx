/**
 * QuickMemoScreen の共有導線のテスト (TASK-128)
 *
 * ヘッダー:
 * - 新規メモ（未保存）: 共有アイコン + ブックマーク
 * - 保存済みメモ: ブックマーク + ケバブメニュー（共有 / 削除）。中央タイトルと重ならないよう
 *   アイコン数を 2 のまま維持する（録音の再生画面 TASK-45 と同じ構成）
 * - 共有が使えない環境（isShareAvailable が false）では従来どおりのヘッダー
 *
 * 共有の流れ:
 * - 「テキストで共有 / .txt ファイル」を選ばせ、それぞれ別の操作として実行する
 * - 共有する内容はエディターの現在の本文（未保存の編集を含む）+ タイトル
 * - Android の .txt はさらに「共有 / デバイスに保存」を選ばせる。iOS は直接共有シートへ
 * - タイトルも本文も空なら共有せずに案内を出す
 */
import React from 'react';
import { Alert, Platform } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import QuickMemoScreen from './index';
import { isShareAvailable } from '@/hooks/useShareRecord';
import {
  saveMemoFileToDevice,
  shareMemoFile,
  shareMemoText,
} from '@/utils/shareMemo';

const mockGetHTML = jest.fn();
const mockRouteParams: { current: Record<string, unknown> | undefined } = {
  current: undefined,
};

jest.mock('@10play/tentap-editor', () => ({
  useEditorBridge: () => ({
    getHTML: mockGetHTML,
    setContent: jest.fn(),
    blur: jest.fn(),
  }),
  TenTapStartKit: [],
  PlaceholderBridge: { configureExtension: jest.fn(() => ({})) },
  darkEditorTheme: {},
  BridgeExtension: jest.fn(),
}));

jest.mock('@/components/features/inputs/BodyInput/appEditorThemeBridge', () => ({
  AppEditorThemeBridge: {},
}));

jest.mock('@/components/features/inputs/TitleInput', () => {
  const { TextInput } = require('react-native');
  return jest.fn(({ value, onChangeText }: any) => (
    <TextInput testID="title-input" value={value} onChangeText={onChangeText} />
  ));
});

jest.mock('@/components/features/inputs/BodyInput', () => {
  const { View } = require('react-native');
  return jest.fn(() => <View testID="body-input" />);
});

jest.mock('@/components/ui/buttons/SubmitButton', () => {
  const { Pressable, Text } = require('react-native');
  return jest.fn(({ onPress }: any) => (
    <Pressable testID="submit-button" onPress={onPress}>
      <Text>SAVE</Text>
    </Pressable>
  ));
});

jest.mock('@/components/ui/buttons/RippleButton', () =>
  jest.fn(({ testID, children, onPress }: any) => {
    const { Pressable } = require('react-native');
    return (
      <Pressable testID={testID} onPress={onPress}>
        {children}
      </Pressable>
    );
  }),
);

// ケバブメニュー本体は ActionButtonWithMenu.test.tsx で検証済み。
// 本物は表示直後の「閉じる」アニメーション（200ms）の完了前に開くと項目が消えるため、
// 開いている間だけ項目を出す簡易モックにする（testID は本物と同じ）
jest.mock('@/components/ui/ActionButtonWithMenu', () =>
  jest.fn(({ menuItems, isOpen, onToggle }: any) => {
    const { Pressable, Text, View } = require('react-native');
    return (
      <View>
        <Pressable testID="action-button-with-menu" onPress={onToggle} />
        {isOpen &&
          menuItems.map((item: any, idx: number) => (
            <Pressable
              key={idx}
              testID={`action-menu-item-${idx}`}
              onPress={() => {
                onToggle();
                item.onPress();
              }}
            >
              <Text>{item.label}</Text>
            </Pressable>
          ))}
      </View>
    );
  }),
);

jest.mock(
  '@/components/features/audioPlayer/LinkedProjectsButtonWithMenu',
  () => jest.fn(() => null),
);

jest.mock('@/hooks/useHeadphonesConnected', () => ({
  useHeadphonesConnected: jest.fn(() => ({ connected: false })),
}));

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn(), goBack: jest.fn() }),
  useRoute: () => ({ params: mockRouteParams.current }),
}));

jest.mock('@/contexts/ModalContext', () => ({
  useModal: () => ({
    showConfirmModal: jest.fn(),
    showLoading: jest.fn(),
    hideLoading: jest.fn(),
    closeModal: jest.fn(),
  }),
}));

jest.mock('@/hooks/useCreateMemo', () => ({
  useCreateMemo: () => ({ createMemo: jest.fn() }),
}));
jest.mock('@/hooks/useUpdateMemo', () => ({
  useUpdateMemo: () => ({ updateMemo: jest.fn() }),
}));
jest.mock('@/hooks/useDeleteMemo', () => ({
  useDeleteMemo: () => ({ deleteMemo: jest.fn() }),
}));
jest.mock('@/hooks/useVoiceTranscription', () => ({
  isInAppVoiceInputSupported: () => false,
  useVoiceTranscription: () => ({
    isListening: false,
    startListening: jest.fn(),
    stopListening: jest.fn(),
  }),
}));
jest.mock('@/hooks/useBlockAndroidBackGesture', () => ({
  useBlockAndroidBackGesture: jest.fn(),
}));

jest.mock('@/hooks/useShareRecord', () => ({
  isShareAvailable: jest.fn(),
}));

jest.mock('@/utils/shareMemo', () => ({
  shareMemoText: jest.fn(),
  shareMemoFile: jest.fn(),
  saveMemoFileToDevice: jest.fn(),
}));

const mockedIsShareAvailable = isShareAvailable as jest.Mock;
const mockedShareMemoText = shareMemoText as jest.Mock;
const mockedShareMemoFile = shareMemoFile as jest.Mock;
const mockedSaveMemoFileToDevice = saveMemoFileToDevice as jest.Mock;

type AlertButton = { text?: string; onPress?: () => void; style?: string };

/** 直近の Alert.alert のボタンから、ラベルに一致するボタンを押す */
const pressAlertButton = (alertSpy: jest.SpyInstance, label: string) => {
  const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as
    | AlertButton[]
    | undefined;
  const button = buttons?.find((b) => b.text === label);
  if (!button?.onPress) throw new Error(`Alert button not found: ${label}`);
  act(() => button.onPress!());
};

describe('QuickMemoScreen 共有 (TASK-128)', () => {
  const originalOS = Platform.OS;
  let alertSpy: jest.SpyInstance;

  const setPlatform = (os: typeof Platform.OS) => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouteParams.current = undefined;
    mockedIsShareAvailable.mockReturnValue(true);
    mockGetHTML.mockResolvedValue('<p>1 行目</p><p>2 行目</p>');
    mockedShareMemoText.mockResolvedValue(undefined);
    mockedShareMemoFile.mockResolvedValue(undefined);
    mockedSaveMemoFileToDevice.mockResolvedValue('saved');
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    setPlatform('ios');
  });

  afterEach(() => {
    alertSpy.mockRestore();
    setPlatform(originalOS);
  });

  describe('ヘッダー', () => {
    it('新規メモは共有アイコンを表示し、ケバブメニューは出さない', () => {
      const { getByTestId, queryByTestId } = render(<QuickMemoScreen />);
      expect(getByTestId('toolbar-share')).toBeTruthy();
      expect(queryByTestId('action-button-with-menu')).toBeNull();
    });

    it('保存済みメモは共有アイコンを出さず、ケバブメニューに「共有」「削除」をまとめる', async () => {
      mockRouteParams.current = {
        id: 'memo-1',
        title: '新曲',
        body: '<p>歌詞</p>',
        isBookmarked: false,
      };
      const { getByTestId, queryByTestId, findByTestId } = render(
        <QuickMemoScreen />,
      );

      expect(queryByTestId('toolbar-share')).toBeNull();
      fireEvent.press(getByTestId('action-button-with-menu'));
      // メニュー項目の順序（action-menu-item-0 / -1）は E2E でも使う
      expect(await findByTestId('action-menu-item-0')).toHaveTextContent('共有');
      expect(getByTestId('action-menu-item-1')).toHaveTextContent('削除');
    });

    it('共有が使えない環境では共有アイコンもケバブメニューも出さない', () => {
      mockedIsShareAvailable.mockReturnValue(false);
      mockRouteParams.current = { id: 'memo-1', title: 'a', body: '<p>b</p>' };
      const { queryByTestId } = render(<QuickMemoScreen />);

      expect(queryByTestId('toolbar-share')).toBeNull();
      expect(queryByTestId('action-button-with-menu')).toBeNull();
    });
  });

  describe('共有の流れ', () => {
    it('「テキストで共有」はタイトル + エディターの現在の本文をテキストで共有する', async () => {
      const { getByTestId } = render(<QuickMemoScreen />);
      fireEvent.changeText(getByTestId('title-input'), '新曲');

      fireEvent.press(getByTestId('toolbar-share'));
      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      expect(alertSpy.mock.calls[0][0]).toBe('クイックメモを共有');

      pressAlertButton(alertSpy, 'テキストで共有');
      await waitFor(() =>
        expect(mockedShareMemoText).toHaveBeenCalledWith(
          '# 新曲\n\n1 行目\n2 行目',
        ),
      );
      expect(mockedShareMemoFile).not.toHaveBeenCalled();
    });

    it('iOS の「.txt ファイル」はタイトル名の .txt を直接共有シートへ渡す', async () => {
      const { getByTestId } = render(<QuickMemoScreen />);
      fireEvent.changeText(getByTestId('title-input'), '新曲');

      fireEvent.press(getByTestId('toolbar-share'));
      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      pressAlertButton(alertSpy, '.txt ファイル');

      await waitFor(() =>
        expect(mockedShareMemoFile).toHaveBeenCalledWith(
          '# 新曲\n\n1 行目\n2 行目',
          '新曲.txt',
        ),
      );
      expect(mockedShareMemoText).not.toHaveBeenCalled();
      expect(alertSpy).toHaveBeenCalledTimes(1);
    });

    it('Android の「.txt ファイル」は「共有 / デバイスに保存」を選ばせる', async () => {
      setPlatform('android');
      const { getByTestId } = render(<QuickMemoScreen />);
      fireEvent.changeText(getByTestId('title-input'), '新曲');

      fireEvent.press(getByTestId('toolbar-share'));
      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      pressAlertButton(alertSpy, '.txt ファイル');

      expect(alertSpy).toHaveBeenCalledTimes(2);
      expect(alertSpy.mock.calls[1][0]).toBe('.txt ファイル');
      expect(mockedShareMemoFile).not.toHaveBeenCalled();

      pressAlertButton(alertSpy, '共有');
      await waitFor(() =>
        expect(mockedShareMemoFile).toHaveBeenCalledWith(
          '# 新曲\n\n1 行目\n2 行目',
          '新曲.txt',
        ),
      );
    });

    it('Android の「デバイスに保存」は保存して「保存完了」を表示する', async () => {
      setPlatform('android');
      const { getByTestId } = render(<QuickMemoScreen />);
      fireEvent.changeText(getByTestId('title-input'), '新曲');

      fireEvent.press(getByTestId('toolbar-share'));
      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      pressAlertButton(alertSpy, '.txt ファイル');
      pressAlertButton(alertSpy, 'デバイスに保存');

      await waitFor(() =>
        expect(mockedSaveMemoFileToDevice).toHaveBeenCalledWith(
          '# 新曲\n\n1 行目\n2 行目',
          '新曲.txt',
        ),
      );
      await waitFor(() =>
        expect(alertSpy).toHaveBeenLastCalledWith(
          '保存完了',
          '選択したフォルダに保存しました。',
        ),
      );
    });

    it('フォルダ選択をキャンセルした場合は何も表示しない', async () => {
      setPlatform('android');
      mockedSaveMemoFileToDevice.mockResolvedValueOnce('cancelled');
      const { getByTestId } = render(<QuickMemoScreen />);
      fireEvent.changeText(getByTestId('title-input'), '新曲');

      fireEvent.press(getByTestId('toolbar-share'));
      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      pressAlertButton(alertSpy, '.txt ファイル');
      pressAlertButton(alertSpy, 'デバイスに保存');

      await waitFor(() => expect(mockedSaveMemoFileToDevice).toHaveBeenCalled());
      expect(alertSpy).toHaveBeenCalledTimes(2);
    });

    it('共有に失敗したらエラーを表示する', async () => {
      mockedShareMemoText.mockRejectedValueOnce(new Error('boom'));
      jest.spyOn(console, 'error').mockImplementation(() => {});
      const { getByTestId } = render(<QuickMemoScreen />);
      fireEvent.changeText(getByTestId('title-input'), '新曲');

      fireEvent.press(getByTestId('toolbar-share'));
      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      pressAlertButton(alertSpy, 'テキストで共有');

      await waitFor(() =>
        expect(alertSpy).toHaveBeenLastCalledWith(
          'エラー',
          '共有に失敗しました。時間をおいて再度お試しください。',
        ),
      );
    });

    it('タイトルも本文も空なら共有せずに案内を出す', async () => {
      mockGetHTML.mockResolvedValueOnce('<p></p>');
      const { getByTestId } = render(<QuickMemoScreen />);

      fireEvent.press(getByTestId('toolbar-share'));
      await waitFor(() =>
        expect(alertSpy).toHaveBeenCalledWith(
          '共有する内容がありません',
          'タイトルか本文を入力してから共有してください。',
        ),
      );
      expect(mockedShareMemoText).not.toHaveBeenCalled();
      expect(mockedShareMemoFile).not.toHaveBeenCalled();
    });

    it('保存済みメモはケバブメニューの「共有」から同じ選択に進む', async () => {
      mockRouteParams.current = {
        id: 'memo-1',
        title: '保存済み',
        body: '<p>歌詞</p>',
        isBookmarked: false,
      };
      mockGetHTML.mockResolvedValueOnce('<p>編集中の歌詞</p>');
      const { getByTestId, findByTestId } = render(<QuickMemoScreen />);

      fireEvent.press(getByTestId('action-button-with-menu'));
      fireEvent.press(await findByTestId('action-menu-item-0'));
      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      pressAlertButton(alertSpy, 'テキストで共有');

      await waitFor(() =>
        expect(mockedShareMemoText).toHaveBeenCalledWith(
          '# 保存済み\n\n編集中の歌詞',
        ),
      );
    });
  });
});
