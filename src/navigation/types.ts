export type RootStackParamList = {
  SignIn: undefined;
  PasswordReset: undefined;
  Register: undefined;
  HomeTabs: undefined;
  ProjectList: undefined;
  TrackList: undefined;
  Profile: undefined;
  Drafts: undefined;
  AudioPlayer: { trackIndex: number; tracks: Track[] };
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
      }
    | undefined;
  RecordList?: undefined;
  NewProject: undefined;
};
