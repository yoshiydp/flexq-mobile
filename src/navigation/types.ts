import type { NavigatorScreenParams } from '@react-navigation/native';
import type { SerializedTrackType } from '@/types/trackType';

/** HomeTabsNavigator（ボトムタブ）のスクリーン */
export type HomeTabsParamList = {
  ProjectList: undefined;
  TrackList: undefined;
  Profile: undefined;
  Drafts: undefined;
};

export type RootStackParamList = {
  SignIn: undefined;
  PasswordReset: undefined;
  Register: undefined;
  HomeTabs: NavigatorScreenParams<HomeTabsParamList> | undefined;
  ProjectList: undefined;
  TrackList: undefined;
  Profile: undefined;
  Drafts: undefined;
  AudioPlayer: { trackIndex: number; tracks: SerializedTrackType[] };
  ProjectEdit:
    | {
        id?: string;
        projectName?: string;
        artwork?: { uri: string };
        trackName?: string;
        trackSource?: any;
        waveformJson?: any;
        cueButtons?: { time: number; label: string; isActive: boolean }[];
        tags?: string[];
        updatedAt?: Date;
        body?: string;
      }
    | undefined;
  ProjectSettings: {
    id: string;
    artwork?: { uri: string };
    trackSource?: string;
    trackId?: string;
    trackName?: string;
  } | undefined;
  ProfileEdit: undefined;
  QuickMemo?: {
    id?: string;
    title?: string;
    body?: string;
    isBookmarked?: boolean;
    source?: 'Drafts' | undefined;
  };
  MemoList: { source?: 'Drafts' | undefined } | undefined;
  QuickRecord?: {
    id?: string;
    title?: string;
    body?: string;
    isBookmarked?: boolean;
    source?: 'Drafts' | undefined;
  };
  RecordPlayer:
    | {
        id?: string;
        recordedFile?: string;
        recordedDuration?: number;
        title?: string;
        isBookmarked?: boolean;
        source?: 'Drafts' | 'ProjectEdit' | undefined;
        projectId?: string;
        /** 録音開始時のトラック再生位置（ms）。トラック同期再生に使用 */
        startPositionMs?: number;
        /** 録音時に使用したトラック音源のソース（未保存のトラック差し替えを含む）。トラック同期再生に使用 */
        trackSource?: string;
        /** 録音開始時点のイヤホン接続状態（AI クリーンアップ用） */
        recordedWithHeadphones?: 'wired' | 'bluetooth' | 'none';
        /** 開始位置に焼き込まれた出力遅延（ms）。トラック同期再生・ミックスで差し引く（TASK-124） */
        recordingLatencyMs?: number;
        /** 保存成功後に AI クリーンアップを自動実行するか */
        autoCleanup?: boolean;
        separationStatus?: 'none' | 'processing' | 'done' | 'failed';
        separatedSource?: string;
      }
    | undefined;
  RecordList: { source?: 'Drafts' | undefined } | undefined;
  NewProject: undefined;
};
