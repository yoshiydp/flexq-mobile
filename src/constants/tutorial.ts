import type { FontAwesomeIconName } from '@/types/iconTypes';

/**
 * 初回チュートリアル（TASK-139）のページ定義。
 * 画面別のヒント（ProjectEdit / DRAFTS の初回表示など）を後から足せるよう、
 * ページは id を持つデータとして定義し、TutorialModal は描画だけを担う。
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

export const TUTORIAL_LABELS = {
  skip: 'スキップ',
  next: '次へ',
  later: 'あとで',
  createProject: 'プロジェクトを作成する',
  close: '閉じる',
};
