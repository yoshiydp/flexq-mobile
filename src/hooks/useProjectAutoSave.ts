import { useCallback, useEffect, useRef } from 'react';
import { CuePointType } from '@/types/cuePointType';
import { useUpdateProject } from '@/hooks/useUpdateProject';

/** 無操作でこの時間が経過したら自動保存を実行する（5 分） */
export const AUTO_SAVE_IDLE_TIMEOUT_MS = 5 * 60 * 1000;

/**
 * 保存対象となるプロジェクト編集状態のスナップショット。
 * 手動保存（onSubmitSaveProject）が送信するフィールドと揃えている。
 */
export interface ProjectSaveSnapshot {
  projectName: string;
  body: string;
  cueButtons: CuePointType[];
  artworkKey?: string;
  trackId?: string;
  trackName?: string;
}

interface UseProjectAutoSaveParams {
  projectId: string;
  /** 現在の編集状態を返す関数。最新の状態を返せるよう ref ベースで渡すこと */
  getSnapshot: () => ProjectSaveSnapshot;
  /**
   * false の間は無操作タイマーを停止する（REC モード中など）。
   * true に戻るとタイマーが再開する。saveIfDirty の手動呼び出しには影響しない
   */
  enabled?: boolean;
  idleTimeoutMs?: number;
}

/**
 * dirty 判定を比較可能な形へ正規化する。
 * undefined と null を同一視し、キー順を固定して JSON 化する
 */
const serializeSnapshot = (snapshot: ProjectSaveSnapshot): string =>
  JSON.stringify({
    projectName: snapshot.projectName,
    body: snapshot.body,
    cueButtons: snapshot.cueButtons.map((cue) => ({
      label: cue.label ?? null,
      isActive: cue.isActive,
      time: cue.time ?? null,
    })),
    artworkKey: snapshot.artworkKey ?? null,
    trackId: snapshot.trackId ?? null,
    trackName: snapshot.trackName ?? null,
  });

/**
 * プロジェクト編集のサイレント自動保存フック（TASK-46）。
 *
 * - 最後に保存した状態（baseline）とのスナップショット比較で dirty を判定する
 * - `markInteraction()` が呼ばれるたびに無操作タイマーをリセットし、
 *   無操作が idleTimeoutMs 継続した時点で dirty の場合のみサイレント保存する
 * - 保存はモーダルやローディングを表示せず、失敗してもアラートを出さない
 *   （baseline を更新しないため、次回の発火で自動的にリトライされる）
 * - `saveIfDirty()` は dirty チェック込みの保存関数として単独で呼び出せる。
 *   TASK-48（バックグラウンド遷移時保存）はこれを AppState トリガーから呼ぶ想定。
 *   すでに保存が進行中の場合は false を返すため、完了を待ちたい場合は
 *   `waitForPendingAutoSave()` を併用する
 * - 手動保存など別経路の PUT を行う前には `waitForPendingAutoSave()` を await し、
 *   古いスナップショットの自動保存が後から完了して新しい保存を上書きするのを防ぐ
 */
export function useProjectAutoSave({
  projectId,
  getSnapshot,
  enabled = true,
  idleTimeoutMs = AUTO_SAVE_IDLE_TIMEOUT_MS,
}: UseProjectAutoSaveParams) {
  const { updateProject } = useUpdateProject();

  // 最後に保存した状態のシリアライズ値。null は「初期状態が未設定」を表し、
  // markSaved で baseline が設定されるまで dirty 判定は常に false になる
  const baselineRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  // 進行中のサイレント保存。手動保存との直列化（waitForPendingAutoSave）に使う
  const pendingSaveRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // アンマウント後に await 中の継続処理がタイマーを再開しないようにするフラグ
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // タイマーのコールバックから常に最新の値を参照するための ref 群
  const getSnapshotRef = useRef(getSnapshot);
  getSnapshotRef.current = getSnapshot;
  const updateProjectRef = useRef(updateProject);
  updateProjectRef.current = updateProject;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const idleTimeoutMsRef = useRef(idleTimeoutMs);
  idleTimeoutMsRef.current = idleTimeoutMs;

  const isDirty = useCallback(() => {
    if (baselineRef.current === null) return false;
    return serializeSnapshot(getSnapshotRef.current()) !== baselineRef.current;
  }, []);

  /**
   * baseline を更新する。プロジェクト読み込み直後（初期状態の登録）と
   * 手動保存の成功後に呼ぶ。snapshot 省略時は現在の編集状態を採用する
   */
  const markSaved = useCallback((snapshot?: ProjectSaveSnapshot) => {
    baselineRef.current = serializeSnapshot(
      snapshot ?? getSnapshotRef.current(),
    );
  }, []);

  /**
   * dirty の場合のみサイレント保存を実行する。
   * 保存した場合は true、（未変更・保存中・失敗などで）保存しなかった場合は false を返す。
   * 失敗時は throw せずログのみ残す
   */
  const saveIfDirty = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return false;
    if (baselineRef.current === null) return false;

    const snapshot = getSnapshotRef.current();
    const serialized = serializeSnapshot(snapshot);
    if (serialized === baselineRef.current) return false;

    savingRef.current = true;
    const save = (async () => {
      try {
        await updateProjectRef.current({
          id: projectId,
          projectName: snapshot.projectName,
          body: snapshot.body,
          cueButtons: snapshot.cueButtons,
          ...(snapshot.artworkKey !== undefined
            ? { artworkKey: snapshot.artworkKey }
            : {}),
          ...(snapshot.trackId !== undefined
            ? { trackId: snapshot.trackId }
            : {}),
          ...(snapshot.trackName !== undefined
            ? { trackName: snapshot.trackName }
            : {}),
        });
        baselineRef.current = serialized;
        return true;
      } catch (e) {
        // サイレント保存のため UI には通知しない。baseline を更新しないので
        // 次回のタイマー発火・saveIfDirty 呼び出しでリトライされる
        console.warn('Failed to auto-save project:', e);
        return false;
      } finally {
        savingRef.current = false;
        pendingSaveRef.current = null;
      }
    })();
    pendingSaveRef.current = save;
    return save;
  }, [projectId]);

  /**
   * 進行中のサイレント保存があれば完了を待つ（なければ即座に解決する）。
   * 手動保存の直前に await することで、古いスナップショットの自動保存が
   * 手動保存の後に完了して上書きするのを防ぐ
   */
  const waitForPendingAutoSave = useCallback(async (): Promise<void> => {
    const pending = pendingSaveRef.current;
    if (!pending) return;
    try {
      await pending;
    } catch {
      // saveIfDirty は throw しないため通常到達しない（保険）
    }
  }, []);

  const saveIfDirtyRef = useRef(saveIfDirty);
  saveIfDirtyRef.current = saveIfDirty;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // タイマー発火後に自身を再スケジュールするための ref（下で markInteraction を代入）
  const markInteractionRef = useRef<() => void>(() => {});

  /**
   * ユーザー操作を通知して無操作タイマーをリセットする。
   * enabled が false の間はタイマーを張らない
   */
  const markInteraction = useCallback(() => {
    clearTimer();
    if (!enabledRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void (async () => {
        if (!mountedRef.current || !enabledRef.current) return;
        await saveIfDirtyRef.current();
        // 保存失敗時のリトライと、その後の無操作継続に備えてタイマーを再開する
        // （未変更なら dirty チェックで弾かれ API は呼ばれない）。
        // await 中にアンマウントされた場合は再開しない
        if (!mountedRef.current) return;
        markInteractionRef.current();
      })();
    }, idleTimeoutMsRef.current);
  }, [clearTimer]);
  markInteractionRef.current = markInteraction;

  // マウント時・enabled 復帰時にタイマーを開始し、
  // 無効化・アンマウント時にタイマーを停止する
  useEffect(() => {
    if (enabled) {
      markInteraction();
    } else {
      clearTimer();
    }
    return clearTimer;
  }, [enabled, markInteraction, clearTimer]);

  return {
    saveIfDirty,
    waitForPendingAutoSave,
    markSaved,
    markInteraction,
    isDirty,
  };
}
