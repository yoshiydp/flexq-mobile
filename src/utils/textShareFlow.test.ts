/**
 * textShareFlow のユニットテスト (TASK-128 / TASK-129)
 *
 * - 画面ごとのラベル（クイックメモを共有 / リリックを共有）でダイアログを出す
 * - 「テキストで共有」はテキスト、「.txt ファイル」はタイトル名の .txt を共有する
 * - Android の .txt は「共有 / デバイスに保存」をさらに選ばせる。iOS は直接共有シートへ
 * - requireBody: true（プロジェクト編集）は本文が空ならタイトルがあっても共有しない
 * - readEditorHtml はエディターの最新の HTML を読み、失敗時だけ state の値を使う
 */
import { Alert, Platform } from 'react-native';
import { LYRICS_SHARE_LABELS, MEMO_SHARE_LABELS } from '@/constants/messages';
import {
  saveMemoFileToDevice,
  shareMemoFile,
  shareMemoText,
} from '@/utils/shareMemo';
import { readEditorHtml, startTextShareFlow } from './textShareFlow';

jest.mock('@/utils/shareMemo', () => ({
  shareMemoText: jest.fn(),
  shareMemoFile: jest.fn(),
  saveMemoFileToDevice: jest.fn(),
}));

const mockedShareMemoText = shareMemoText as jest.Mock;
const mockedShareMemoFile = shareMemoFile as jest.Mock;
const mockedSaveMemoFileToDevice = saveMemoFileToDevice as jest.Mock;

type AlertButton = { text?: string; onPress?: () => void };

const LYRICS = '<h1>Verse</h1><p>1 行目</p><p></p><p>2 行目</p>';
const LYRICS_TEXT = '# 新曲\n\n# Verse\n1 行目\n\n2 行目';

describe('startTextShareFlow', () => {
  const originalOS = Platform.OS;
  let alertSpy: jest.SpyInstance;

  const setPlatform = (os: typeof Platform.OS) => {
    Object.defineProperty(Platform, 'OS', { value: os, configurable: true });
  };

  /** 直近の Alert.alert のボタンから、ラベルに一致するボタンを押す */
  const pressAlertButton = (label: string) => {
    const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as
      | AlertButton[]
      | undefined;
    const button = buttons?.find((b) => b.text === label);
    if (!button?.onPress) throw new Error(`Alert button not found: ${label}`);
    button.onPress();
  };

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  const startLyricsShare = (title: string, bodyHtml: string) =>
    startTextShareFlow({
      labels: LYRICS_SHARE_LABELS,
      getContent: async () => ({ title, bodyHtml }),
      requireBody: true,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    mockedShareMemoText.mockResolvedValue(undefined);
    mockedShareMemoFile.mockResolvedValue(undefined);
    mockedSaveMemoFileToDevice.mockResolvedValue('saved');
    setPlatform('ios');
  });

  afterEach(() => {
    alertSpy.mockRestore();
    setPlatform(originalOS);
  });

  it('プロジェクト編集は「リリックを共有」の選択を出し、3 つのボタンを並べる', async () => {
    await startLyricsShare('新曲', LYRICS);

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toBe('リリックを共有');
    const labels = (alertSpy.mock.calls[0][2] as AlertButton[]).map((b) => b.text);
    expect(labels).toEqual(['テキストで共有', '.txt ファイル', 'キャンセル']);
  });

  it('「テキストで共有」は # プロジェクト名 + 歌詞のテキストを共有する', async () => {
    await startLyricsShare('新曲', LYRICS);
    pressAlertButton('テキストで共有');
    await flush();

    expect(mockedShareMemoText).toHaveBeenCalledWith(LYRICS_TEXT);
    expect(mockedShareMemoFile).not.toHaveBeenCalled();
  });

  it('iOS の「.txt ファイル」はプロジェクト名.txt を直接共有シートへ渡す', async () => {
    await startLyricsShare('新曲', LYRICS);
    pressAlertButton('.txt ファイル');
    await flush();

    expect(mockedShareMemoFile).toHaveBeenCalledWith(LYRICS_TEXT, '新曲.txt');
    expect(alertSpy).toHaveBeenCalledTimes(1);
  });

  it('Android の「.txt ファイル」は「共有 / デバイスに保存」を選ばせる', async () => {
    setPlatform('android');
    await startLyricsShare('新曲', LYRICS);
    pressAlertButton('.txt ファイル');

    expect(alertSpy).toHaveBeenCalledTimes(2);
    expect(alertSpy.mock.calls[1][0]).toBe('.txt ファイル');
    expect(mockedShareMemoFile).not.toHaveBeenCalled();

    pressAlertButton('デバイスに保存');
    await flush();
    expect(mockedSaveMemoFileToDevice).toHaveBeenCalledWith(
      LYRICS_TEXT,
      '新曲.txt',
    );
    expect(alertSpy).toHaveBeenLastCalledWith(
      '保存完了',
      '選択したフォルダに保存しました。',
    );
  });

  it('Android の「共有」は .txt を共有シートへ渡す', async () => {
    setPlatform('android');
    await startLyricsShare('新曲', LYRICS);
    pressAlertButton('.txt ファイル');
    pressAlertButton('共有');
    await flush();

    expect(mockedShareMemoFile).toHaveBeenCalledWith(LYRICS_TEXT, '新曲.txt');
  });

  it('requireBody: true は歌詞が空ならプロジェクト名があっても共有せず案内を出す', async () => {
    await startLyricsShare('新曲', '<p></p><p> </p>');

    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith(
      '共有する歌詞がありません',
      '歌詞を入力してから共有してください。',
    );
    expect(mockedShareMemoText).not.toHaveBeenCalled();
  });

  it('requireBody を指定しない（QUICK MEMO）ならタイトルだけでも共有できる', async () => {
    await startTextShareFlow({
      labels: MEMO_SHARE_LABELS,
      getContent: async () => ({ title: 'メモ', bodyHtml: '<p></p>' }),
    });
    expect(alertSpy.mock.calls[0][0]).toBe('クイックメモを共有');

    pressAlertButton('テキストで共有');
    await flush();
    expect(mockedShareMemoText).toHaveBeenCalledWith('# メモ');
  });

  it('QUICK MEMO でもタイトルと本文が両方空なら案内を出す', async () => {
    await startTextShareFlow({
      labels: MEMO_SHARE_LABELS,
      getContent: async () => ({ title: '', bodyHtml: '<p></p>' }),
    });
    expect(alertSpy).toHaveBeenCalledWith(
      '共有する内容がありません',
      'タイトルか本文を入力してから共有してください。',
    );
  });

  it('共有に失敗したらエラーを表示する', async () => {
    mockedShareMemoText.mockRejectedValueOnce(new Error('boom'));
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await startLyricsShare('新曲', LYRICS);
    pressAlertButton('テキストで共有');
    await flush();

    expect(alertSpy).toHaveBeenLastCalledWith(
      'エラー',
      '共有に失敗しました。時間をおいて再度お試しください。',
    );
    errorSpy.mockRestore();
  });

  it('デバイスへの保存に失敗したらエラーを表示し、キャンセルなら何も表示しない', async () => {
    setPlatform('android');
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    mockedSaveMemoFileToDevice.mockResolvedValueOnce('cancelled');
    await startLyricsShare('新曲', LYRICS);
    pressAlertButton('.txt ファイル');
    pressAlertButton('デバイスに保存');
    await flush();
    expect(alertSpy).toHaveBeenCalledTimes(2);

    mockedSaveMemoFileToDevice.mockRejectedValueOnce(new Error('io'));
    await startLyricsShare('新曲', LYRICS);
    pressAlertButton('.txt ファイル');
    pressAlertButton('デバイスに保存');
    await flush();
    expect(alertSpy).toHaveBeenLastCalledWith(
      'エラー',
      'デバイスへの保存に失敗しました。時間をおいて再度お試しください。',
    );
    errorSpy.mockRestore();
  });
});

describe('readEditorHtml', () => {
  it('エディターの最新の HTML を返す', async () => {
    const editor = { getHTML: jest.fn().mockResolvedValue('<p>最新</p>') };
    await expect(readEditorHtml(editor, '<p>古い</p>')).resolves.toBe(
      '<p>最新</p>',
    );
  });

  it('読み取りに失敗したら state の値を返す', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const editor = { getHTML: jest.fn().mockRejectedValue(new Error('x')) };
    await expect(readEditorHtml(editor, '<p>古い</p>')).resolves.toBe(
      '<p>古い</p>',
    );
    errorSpy.mockRestore();
  });

  it('エディターが空文字や undefined を返したら空文字にする', async () => {
    const editor = { getHTML: jest.fn().mockResolvedValue(undefined) };
    await expect(readEditorHtml(editor, '<p>古い</p>')).resolves.toBe('');
  });
});
