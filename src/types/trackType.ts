/**
 * トラック（音源）の共有型。
 * API から取得したトラック一覧（useFetchTrack）と、画面遷移パラメータの
 * 双方から参照するため src/types に置く
 */

/** トラックに紐づくプロジェクト */
export interface LinkedProject {
  id: string;
  name: string;
}

export interface TrackType {
  id: string;
  title: string;
  source: string;
  artwork: string;
  linkedProjects: LinkedProject[];
  extention: string;
  /** 作成日時。createdAt 導入前の既存データは updatedAt でフォールバック（TASK-51） */
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ナビゲーションパラメータとして渡すトラック。
 * Date はシリアライズ不可の警告を避けるため ISO 文字列に変換して渡す
 * （TrackListScreen → AudioPlayerScreen）
 */
export type SerializedTrackType = Omit<TrackType, 'createdAt' | 'updatedAt'> & {
  createdAt: string;
  updatedAt: string;
};
