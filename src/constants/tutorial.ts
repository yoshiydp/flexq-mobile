import type { FontAwesomeIconName } from '@/types/iconTypes';
import type { TutorialId } from '@/utils/tutorialStorage';

/**
 * 初回チュートリアル（TASK-139）と画面ごとの初回ヒント（TASK-140）のページ定義。
 * ページは id を持つデータとして定義し、TutorialModal は描画だけを担う。
 * 動画は .maestro/tutorial/ の撮影手順で作る（UI を変えたら撮り直す）。
 */
export interface TutorialPoint {
  icon: FontAwesomeIconName;
  label: string;
  description: string;
}

export interface TutorialPage {
  id: string;
  title: string;
  lead: string;
  /** 主な機能の箇条書き（アイコン + 名前 + 説明） */
  points?: TutorialPoint[];
  /** 画面収録の動画（require した mp4。無音・ループ再生） */
  video?: number;
  /** 動画の縦横比（幅 / 高さ） */
  videoAspectRatio?: number;
  /** 動画の読み込み中に表示する静止画（動画の先頭フレーム。読み込み中の黒画面を避ける） */
  videoPoster?: number;
}

export const ONBOARDING_TUTORIAL_PAGES: TutorialPage[] = [
  {
    id: 'welcome',
    title: 'FlexQ へようこそ',
    lead: 'トラックを聴きながら歌詞を書き、その場で録音して確かめられる作詞アプリです。',
    points: [
      {
        icon: 'list-ul',
        label: 'PROJECT',
        description: '歌詞・トラック・録音をひとつにまとめて作詞を進める場所',
      },
      {
        icon: 'microphone',
        label: 'DRAFTS',
        description: '思いついたフレーズやメロディを、すぐにメモ・録音',
      },
      {
        icon: 'music',
        label: 'TRACK LIST',
        description: '作詞に使うトラック（音源）の置き場所',
      },
    ],
  },
  {
    id: 'create-project',
    title: 'まずはプロジェクトを作ろう',
    // 動画は登録済みトラックを FROM TRACK LIST で選んでいるが、新規ユーザーはトラックが 0 件のため
    // UPLOAD NEW で音源を追加する導線も案内する
    lead: 'NEW PROJECT で名前を付けてトラックを選べば準備完了。手元の音源は UPLOAD NEW から追加できます。',
    video: require('@/assets/video/tutorial-new-project.mp4'),
    videoPoster: require('@/assets/video/tutorial-new-project-poster.jpg'),
    // src/assets/video/tutorial-new-project.mp4 は 750×1514
    videoAspectRatio: 750 / 1514,
  },
];

// ヒント動画（src/assets/video/hint-*.mp4）は 750×1514。.maestro/tutorial/record-hints.sh で撮る。
// タップ位置の印は撮影用の開発ビルドだけで出る（components/dev/TouchIndicatorBoundary）
const HINT_VIDEO_ASPECT_RATIO = 750 / 1514;

/** プロジェクト編集を初めて開いたときのヒント（TASK-140）: 歌詞 → CUE の 3 操作 → REC */
export const PROJECT_EDIT_HINT_PAGES: TutorialPage[] = [
  {
    id: 'project-edit-lyrics',
    title: '歌詞を書く',
    lead: '歌詞のエリアをタップすると入力できます。トラックを再生しながら書き進めましょう。書いた内容は、一覧に戻るときに保存できます。',
    video: require('@/assets/video/hint-project-edit-lyrics.mp4'),
    videoPoster: require('@/assets/video/hint-project-edit-lyrics-poster.jpg'),
    videoAspectRatio: HINT_VIDEO_ASPECT_RATIO,
  },
  {
    id: 'project-edit-cue-tap',
    title: 'CUE：タップで位置を登録',
    // 登録とジャンプの 2 つの役割を両方書く（書かないと 2 回目のタップで再生位置が飛んで戸惑う）
    lead: '再生中に CUE をタップすると、今の再生位置を登録します。登録した CUE をもう一度タップすると、その位置から再生します。',
    video: require('@/assets/video/hint-project-edit-cue-tap.mp4'),
    videoPoster: require('@/assets/video/hint-project-edit-cue-tap-poster.jpg'),
    videoAspectRatio: HINT_VIDEO_ASPECT_RATIO,
  },
  {
    id: 'project-edit-cue-double-tap',
    title: 'CUE：ダブルタップでリセット',
    lead: '登録した CUE をすばやく 2 回タップすると、未登録に戻ります。まとめて消すときは ALL CUE RESET を使います。',
    video: require('@/assets/video/hint-project-edit-cue-double-tap.mp4'),
    videoPoster: require('@/assets/video/hint-project-edit-cue-double-tap-poster.jpg'),
    videoAspectRatio: HINT_VIDEO_ASPECT_RATIO,
  },
  {
    id: 'project-edit-cue-long-press',
    title: 'CUE：長押しで名前を変更',
    // 名前の変更は登録済みの CUE だけ（handleCueButtonLongPress）
    lead: '登録した CUE を長押しすると、「Hook」「Verse」のように名前を付けられます。未登録の CUE は長押ししても変わりません。',
    video: require('@/assets/video/hint-project-edit-cue-long-press.mp4'),
    videoPoster: require('@/assets/video/hint-project-edit-cue-long-press-poster.jpg'),
    videoAspectRatio: HINT_VIDEO_ASPECT_RATIO,
  },
  {
    id: 'project-edit-rec',
    title: 'REC で録音する',
    lead: 'REC MODE に切り替えて REC ボタンを押すと、トラックに合わせて録音できます。録ったテイクはすぐに聴き返せて、AI クリーンアップで声だけを取り出すこともできます。',
    video: require('@/assets/video/hint-project-edit-rec.mp4'),
    videoPoster: require('@/assets/video/hint-project-edit-rec-poster.jpg'),
    videoAspectRatio: HINT_VIDEO_ASPECT_RATIO,
  },
];

/** DRAFTS を初めて開いたときのヒント（TASK-140）: クイックメモ → クイック録音 */
export const DRAFTS_HINT_PAGES: TutorialPage[] = [
  {
    id: 'drafts-quick-memo',
    title: 'QUICK MEMO で書き留める',
    lead: 'プロジェクトを作らずに、思いついたフレーズをすぐメモできます。保存したメモは MEMO LIST から見返せます。',
    video: require('@/assets/video/hint-drafts-quick-memo.mp4'),
    videoPoster: require('@/assets/video/hint-drafts-quick-memo-poster.jpg'),
    videoAspectRatio: HINT_VIDEO_ASPECT_RATIO,
  },
  {
    id: 'drafts-quick-record',
    title: 'QUICK RECORD ですぐ録音',
    lead: 'ボタンを押すとすぐに録音が始まります。浮かんだメロディを忘れないうちに残しましょう。録音は RECORD LIST から聴き返せます。',
    video: require('@/assets/video/hint-drafts-quick-record.mp4'),
    videoPoster: require('@/assets/video/hint-drafts-quick-record-poster.jpg'),
    videoAspectRatio: HINT_VIDEO_ASPECT_RATIO,
  },
];

export interface TutorialGuide {
  id: TutorialId;
  label: string;
  description: string;
  icon: FontAwesomeIconName;
  pages: TutorialPage[];
}

/** PROFILE の「HOW TO USE」で選べる案内の一覧（TASK-140） */
export const TUTORIAL_GUIDES: TutorialGuide[] = [
  {
    id: 'onboarding',
    label: 'はじめに',
    description: 'FlexQ の主な機能と、プロジェクトの作り方',
    icon: 'flag',
    pages: ONBOARDING_TUTORIAL_PAGES,
  },
  {
    id: 'projectEdit',
    label: 'プロジェクト編集',
    description: '歌詞・CUE・REC の使い方',
    icon: 'pencil',
    pages: PROJECT_EDIT_HINT_PAGES,
  },
  {
    id: 'drafts',
    label: 'DRAFTS',
    description: 'クイックメモとクイック録音',
    icon: 'microphone',
    pages: DRAFTS_HINT_PAGES,
  },
];

export const TUTORIAL_LABELS = {
  skip: 'スキップ',
  next: '次へ',
  later: 'あとで',
  createProject: 'プロジェクトを作成する',
  close: '閉じる',
  guideTitle: 'HOW TO USE',
  guideLead: '見たい案内を選んでください。',
};
