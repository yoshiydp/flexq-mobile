/**
 * プロジェクト編集のヘッダー（三本線）からプロジェクト設定を開くときの手順（TASK-130）。
 *
 * iOS は歌詞エディタ（tentap の WKWebView）がファーストレスポンダのままだと、
 * 別画面が上に被さってもキーボードを閉じない（@react-navigation/stack の JS カード遷移では
 * ProjectEdit はマウントされたまま）。OS の暗黙の挙動に頼らず、画面を離れる前に
 * アプリ側で明示的に閉じる。閉じ方はチェックマーク（PE-04）と同じ経路に揃え、
 * 編集モードの終了とキーボードの dismiss を一緒に行う。
 */
export interface OpenProjectSettingsDeps {
  /** 歌詞の編集モード中か */
  isEditingLyrics: boolean;
  /** 編集モードの切り替え（handleToggleEditLyrics。終了時に editor.blur まで行う） */
  toggleEditLyrics: () => void;
  /** 編集モードでないときにエディタのフォーカスだけ外す（editor.blur） */
  blurEditor: () => void;
  /** タイトル入力（ネイティブ TextInput）にフォーカスがある場合に備える（Keyboard.dismiss） */
  dismissKeyboard: () => void;
  /** ProjectSettings への遷移。キーボードを閉じたあとに呼ぶ */
  navigate: () => void;
}

export const openProjectSettings = ({
  isEditingLyrics,
  toggleEditLyrics,
  blurEditor,
  dismissKeyboard,
  navigate,
}: OpenProjectSettingsDeps): void => {
  if (isEditingLyrics) toggleEditLyrics();
  else blurEditor();
  dismissKeyboard();
  navigate();
};
