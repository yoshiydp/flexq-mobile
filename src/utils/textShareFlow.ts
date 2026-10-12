import { Alert, Platform } from 'react-native';
import {
  SHARE_LABELS,
  TEXT_SHARE_LABELS,
  type TextShareScreenLabels,
} from '@/constants/messages';
import {
  buildMemoShareFileName,
  buildMemoShareText,
  htmlToMemoText,
} from '@/utils/memoShareText';
import {
  saveMemoFileToDevice,
  shareMemoFile,
  shareMemoText,
} from '@/utils/shareMemo';

/**
 * QUICK MEMO（TASK-128）とプロジェクト編集のリリック（TASK-129）で共通の共有の流れ。
 *
 * 1. 共有する内容（タイトル + 本文 HTML）を画面から受け取り、Markdown 記法のテキストにする
 * 2. 内容が無ければ案内を出して終える
 * 3. 「テキストで共有 / .txt ファイル」を選ばせる（別々の操作）
 *    - テキストで共有: OS の共有シート（LINE・iOS メモ・Google Keep など）
 *    - .txt ファイル: iOS は共有シートへ（「ファイルに保存」も可）。Android は共有シートに
 *      保存の項目が無いため「共有 / デバイスに保存」をさらに選ばせる（録音の TASK-55 と同じ）
 */

export type TextShareContent = {
  /** 共有テキストの先頭に `# タイトル` として付ける。ファイル名にも使う */
  title: string;
  /** リッチエディター（tentap）の HTML。未保存の編集を含む現在の内容を渡す */
  bodyHtml: string;
};

export type TextShareFlowOptions = {
  /** 画面ごとのダイアログのタイトルと、共有する内容が無いときの案内 */
  labels: TextShareScreenLabels;
  /** 共有する内容を返す。共有ボタンを押した時点の内容を読むため、呼び出しのたびに実行する */
  getContent: () => Promise<TextShareContent>;
  /**
   * true のとき、本文が空ならタイトルがあっても共有しない（プロジェクト名は必ずあるため、
   * 名前だけのリリックは共有しない）。false（既定）はタイトルか本文のどちらかがあれば共有する
   */
  requireBody?: boolean;
};

const runShareAction = async (action: () => Promise<void>) => {
  try {
    await action();
  } catch (error) {
    console.error('Failed to share text:', error);
    Alert.alert('エラー', TEXT_SHARE_LABELS.failed);
  }
};

const runSaveToDevice = async (text: string, fileName: string) => {
  try {
    const result = await saveMemoFileToDevice(text, fileName);
    if (result === 'saved') {
      Alert.alert(SHARE_LABELS.saveDoneTitle, SHARE_LABELS.saveDone);
    }
  } catch (error) {
    console.error('Failed to save text file to device:', error);
    Alert.alert('エラー', TEXT_SHARE_LABELS.saveFailed);
  }
};

const chooseFileAction = (text: string, fileName: string) => {
  if (Platform.OS === 'android') {
    Alert.alert(TEXT_SHARE_LABELS.chooseFileActionTitle, undefined, [
      {
        text: TEXT_SHARE_LABELS.actionShare,
        onPress: () => void runShareAction(() => shareMemoFile(text, fileName)),
      },
      {
        text: TEXT_SHARE_LABELS.actionSave,
        onPress: () => void runSaveToDevice(text, fileName),
      },
      { text: TEXT_SHARE_LABELS.cancel, style: 'cancel' },
    ]);
    return;
  }
  void runShareAction(() => shareMemoFile(text, fileName));
};

/** 共有ボタンが押されたときに呼ぶ。共有の選択ダイアログを開く（内容が無ければ案内を出す） */
export const startTextShareFlow = async ({
  labels,
  getContent,
  requireBody = false,
}: TextShareFlowOptions): Promise<void> => {
  const { title, bodyHtml } = await getContent();
  const text = buildMemoShareText(title, bodyHtml);
  const hasContent = requireBody ? htmlToMemoText(bodyHtml) !== '' : text !== '';
  if (!hasContent) {
    Alert.alert(labels.emptyTitle, labels.empty);
    return;
  }
  const fileName = buildMemoShareFileName(title);

  Alert.alert(labels.chooseTitle, undefined, [
    {
      text: TEXT_SHARE_LABELS.shareText,
      onPress: () => void runShareAction(() => shareMemoText(text)),
    },
    {
      text: TEXT_SHARE_LABELS.shareFile,
      onPress: () => chooseFileAction(text, fileName),
    },
    { text: TEXT_SHARE_LABELS.cancel, style: 'cancel' },
  ]);
};

/**
 * エディターから最新の本文 HTML を読む。エディターの body state はデバウンスして同期されるため
 * 共有では getHTML() を優先し、読めなかった場合だけ state の値（fallback）を使う
 */
export const readEditorHtml = async (
  editor: { getHTML: () => Promise<string> },
  fallback: string,
): Promise<string> => {
  try {
    return (await editor.getHTML()) || '';
  } catch (error) {
    console.error('Failed to read editor body for sharing:', error);
    return fallback;
  }
};
