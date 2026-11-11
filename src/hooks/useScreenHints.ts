import { DefaultService } from '@/apiClient/services/DefaultService';
import { hasVisibleText } from '@/utils/hasVisibleText';
import { withRequestTimeout } from '@/utils/requestTimeout';
import { useFirstTimeTutorial } from './useFirstTimeTutorial';

/**
 * 画面ごとの初回ヒント（TASK-140）の表示判定。
 * どちらも「すでに使い慣れたユーザー」には出さずに完了扱いにする
 * （OTA 配信時にリリース済みのユーザーへ一斉に出さないため）。
 */

interface ProjectEditHintParams {
  /** プロジェクト詳細と録音一覧の取得が成功したか */
  ready: boolean;
  /** 開いたプロジェクトの録音の件数 */
  recordCount: number;
  /** 開いたプロジェクトの歌詞（エディタの HTML） */
  lyricsHtml: string | null | undefined;
}

/**
 * プロジェクト編集のヒント。次のどれかに当てはまれば使い慣れているとみなす:
 * - 開いたプロジェクトに録音か歌詞がある（作業済みのプロジェクト）
 * - プロジェクトを 2 件以上持っている（初回チュートリアルから最初の 1 件を作った直後のユーザーには出す）
 * プロジェクト件数は未完了の端末で 1 回だけ取得する（取得に失敗したら今回は表示しない）
 */
export function useProjectEditHint({
  ready,
  recordCount,
  lyricsHtml,
}: ProjectEditHintParams) {
  return useFirstTimeTutorial('projectEdit', {
    ready,
    shouldSkip: async () => {
      if (recordCount > 0 || hasVisibleText(lyricsHtml)) return true;
      const projects = await withRequestTimeout(DefaultService.getProject());
      return projects.length > 1;
    },
  });
}

interface DraftsHintParams {
  /** メモ一覧と録音一覧の取得が成功したか */
  ready: boolean;
  memoCount: number;
  recordCount: number;
}

/** DRAFTS のヒント。メモか録音が 1 件でもあれば使い慣れているとみなす */
export function useDraftsHint({ ready, memoCount, recordCount }: DraftsHintParams) {
  return useFirstTimeTutorial('drafts', {
    ready,
    shouldSkip: () => memoCount > 0 || recordCount > 0,
  });
}
