import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import {
  ProjectSaveSnapshot,
  serializeSnapshot,
} from '@/hooks/useProjectAutoSave';

interface UseProjectBackgroundSaveParams {
  /** 現在の編集内容のスナップショットを返す関数（毎レンダー最新のものを渡してよい） */
  getSnapshot: () => ProjectSaveSnapshot;
  /**
   * dirty ならサイレント保存を実行する関数。useProjectAutoSave（TASK-46）の
   * `saveIfDirty` を渡す想定。dirty 判定・保存の実行・排他制御（savingRef）は
   * すべてそちら側に一元化されている
   */
  saveIfDirty: () => Promise<boolean>;
  /**
   * 進行中のサイレント保存（idle timer 経由の saveIfDirty）があれば完了を待つ。
   * useProjectAutoSave の `waitForPendingAutoSave` を渡す想定。
   * バックグラウンド遷移時に別トリガーの保存が in flight だと `saveIfDirty` が
   * 即座に no-op してしまうため、待ってから最新のスナップショットで
   * 保存を試みることで取りこぼしを防ぐ
   */
  waitForPendingAutoSave: () => Promise<void>;
}

/**
 * ProjectEdit 編集中に AppState が active → inactive / background へ遷移した
 * タイミングで、useProjectAutoSave（TASK-46）の共通サイレント保存関数
 * `saveIfDirty` を呼び出すフック (TASK-48)。
 *
 * - dirty 判定・保存実行・排他制御は useProjectAutoSave 側に集約されているため、
 *   このフックは AppState イベントの検知と、離脱中に届いた新しい編集を
 *   拾うための再試行スケジューリングのみを担当する
 * - iOS では別アプリへの移動時にまず `inactive` を経由し、その後 `background`
 *   になる。どちらの遷移でも保存を試みる（`inactive` 中に届いた最後の編集を
 *   `background` 遷移時にも拾うため）
 * - Android は `background` の単発遷移のみのため、保存完了時点でまだ
 *   バックグラウンドにいれば再チェックして拾う（次の AppState イベントを待たない）
 * - 保存試行の前に `waitForPendingAutoSave` を待つ。idle timer 経由の
 *   saveIfDirty が既に in flight の場合、待たずに呼ぶと即座に no-op して
 *   しまい、in flight の保存が完了した後に届いた新しい編集を取りこぼす
 * - 保存試行時点のスナップショットと完了時点の最新スナップショットを比較し、
 *   「新しい編集が届いていた場合のみ」再試行する。baseline との比較にすると
 *   保存失敗時に無限に即時リトライしてしまうため、あえて試行時点のスナップ
 *   ショットと比較する（失敗時のリトライは次回の離脱遷移に委ねる）
 * - タスクキル（スワイプ終了）は JS でフックできないため、この
 *   inactive / background 遷移時の保存で実質カバーする
 * - AppState リスナーはこのフック内に閉じる（グローバルには追加しない）
 */
export function useProjectBackgroundSave({
  getSnapshot,
  saveIfDirty,
  waitForPendingAutoSave,
}: UseProjectBackgroundSaveParams) {
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  // 進行中のバックグラウンド保存試行（null なら保存中でない）
  const pendingRef = useRef<Promise<void> | null>(null);

  // 毎レンダー最新のコールバックを参照できるように ref に退避する。
  // AppState イベントは effect のフラッシュを待たずに発火し得るため、
  // コミットと同期する useLayoutEffect で更新して古いスナップショットの
  // 保存を防ぐ
  const getSnapshotRef = useRef(getSnapshot);
  const saveIfDirtyRef = useRef(saveIfDirty);
  const waitForPendingAutoSaveRef = useRef(waitForPendingAutoSave);
  useLayoutEffect(() => {
    getSnapshotRef.current = getSnapshot;
    saveIfDirtyRef.current = saveIfDirty;
    waitForPendingAutoSaveRef.current = waitForPendingAutoSave;
  });

  const trySave = useCallback(() => {
    // 保存中は多重実行しない。保存中に届いた新しい編集は、この
    // 保存が完了した時点で（まだバックグラウンドにいる限り）再チェックで拾われる
    if (pendingRef.current) return;

    pendingRef.current = (async () => {
      // idle timer 経由の saveIfDirty が既に in flight なら完了を待ってから
      // 判定する（待たずに呼ぶと即座に no-op し、in flight の保存より後に
      // 届いた編集を取りこぼすため）
      await waitForPendingAutoSaveRef.current();
      const attempted = serializeSnapshot(getSnapshotRef.current());
      try {
        await saveIfDirtyRef.current();
      } finally {
        pendingRef.current = null;
        const stillBackgrounded =
          appStateRef.current === 'inactive' ||
          appStateRef.current === 'background';
        const latest = serializeSnapshot(getSnapshotRef.current());
        if (stillBackgrounded && latest !== attempted) {
          trySave();
        }
      }
    })();
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      appStateRef.current = nextState;
      // inactive / background へ遷移するたびに毎回チェックする。
      // trySave 自体が pending・dirty チェックで冪等なため、
      // active への復帰時以外は無条件で呼んでよい
      if (nextState !== 'inactive' && nextState !== 'background') return;
      trySave();
    };

    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [trySave]);
}
