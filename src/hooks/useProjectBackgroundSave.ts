import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { CuePointType } from '@/types/cuePointType';
import { CUE_LABELS } from '@/constants/cueLabels';
import type { ProjectDetailType } from '@/hooks/useFetchProjectDetail';

/**
 * バックグラウンド保存の対象となるプロジェクト編集内容のスナップショット。
 * ProjectEditScreen の手動保存（onSubmitSaveProject）と同じフィールドを扱う。
 * TASK-46（無操作 5 分自動保存）の共通保存フックと統合予定。
 */
export interface ProjectSaveSnapshot {
  projectName: string;
  body: string;
  cueButtons: CuePointType[];
  artworkKey?: string;
  trackId?: string;
  trackName?: string;
}

/**
 * サーバーから取得した project を、ProjectEditScreen の state 初期化と
 * 同じ正規化ルールでスナップショットに変換する（dirty 判定のベースライン）。
 * ここの正規化が画面側の初期化とずれると「未編集なのに dirty」になるため、
 * ProjectEditScreen の project useEffect と必ず同期させること。
 */
export function buildBaselineSnapshot(
  project: ProjectDetailType,
): ProjectSaveSnapshot {
  const source = project.cueButtons;
  const cueButtons =
    Array.isArray(source) && source.length > 0
      ? source
      : CUE_LABELS.map((label) => ({
          time: 0,
          label,
          isActive: false,
        }));
  return {
    projectName: project.projectName ?? '',
    body: (project as { body?: string }).body ?? '',
    cueButtons,
    // artworkKey は ProjectSettings で画像を変更したときのみ state に載る
    // （サーバーからの取得値には含まれない）ため、ベースラインは常に undefined
    artworkKey: undefined,
    trackId: project.trackId,
    trackName: project.trackName,
  };
}

const isSameCueButtons = (a: CuePointType[], b: CuePointType[]): boolean => {
  if (a.length !== b.length) return false;
  return a.every((cue, i) => {
    const other = b[i];
    return (
      cue.label === other.label &&
      cue.isActive === other.isActive &&
      cue.time === other.time
    );
  });
};

/** 未保存の変更（dirty）があるかどうかを判定する */
export function isSnapshotDirty(
  baseline: ProjectSaveSnapshot,
  current: ProjectSaveSnapshot,
): boolean {
  return (
    baseline.projectName !== current.projectName ||
    baseline.body !== current.body ||
    baseline.artworkKey !== current.artworkKey ||
    baseline.trackId !== current.trackId ||
    baseline.trackName !== current.trackName ||
    !isSameCueButtons(baseline.cueButtons, current.cueButtons)
  );
}

interface UseProjectBackgroundSaveParams {
  /** ロード済みプロジェクト（null の間は何もしない） */
  project: ProjectDetailType | null;
  /** 現在の編集内容のスナップショットを返す関数（毎レンダー最新のものを渡してよい） */
  getSnapshot: () => ProjectSaveSnapshot;
  /** サイレント保存の実行関数（UI 表示は行わないこと） */
  save: (snapshot: ProjectSaveSnapshot) => Promise<void>;
}

/**
 * ProjectEdit 編集中に AppState が active → inactive / background へ遷移した
 * タイミングで、未保存の変更（dirty）をサイレント保存するフック (TASK-48)。
 *
 * - iOS では別アプリへの移動・タスクスイッチャー表示時にまず `inactive` を
 *   経由するため、`inactive` の時点で保存を開始して background 遷移後の
 *   短い実行時間内に完了する可能性を高める
 * - `active → inactive → background` と連鎖するどちらの遷移でも dirty
 *   チェックを行う。`inactive` 中に届いた最後の編集（リッチテキスト
 *   エディタの遅延更新など）を `background` 遷移時にも拾うため
 * - タスクキル（スワイプ終了）は JS でフックできないため、この
 *   inactive / background 遷移時の保存で実質カバーする
 * - 保存失敗時はベースラインを維持し、次の遷移時に自動的にリトライする
 *   （バックグラウンドのため Alert 等の UI は出さない）
 * - AppState リスナーはこのフック内に閉じる（グローバルには追加しない）
 *
 * TODO(TASK-46): 無操作 5 分自動保存の共通サイレント保存フックと統合予定
 */
export function useProjectBackgroundSave({
  project,
  getSnapshot,
  save,
}: UseProjectBackgroundSaveParams) {
  // 最後に保存された状態（dirty 判定のベースライン）。
  // project の取得・再取得時にサーバー値へリセットされる
  const baselineRef = useRef<ProjectSaveSnapshot | null>(null);
  // 進行中のバックグラウンド保存（null なら保存中でない）。
  // reject しない Promise を保持する（trySave 内でエラーを握りつぶすため）
  const pendingSaveRef = useRef<Promise<void> | null>(null);
  // 直近の AppState（inactive/background から戻って active になったかどうかの
  // 判定に使う）。保存完了後の追い保存を「まだバックグラウンドにいる間」に
  // 限定するためのもの
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  // 毎レンダー最新のコールバックを参照できるように ref に退避する。
  // AppState イベントは effect のフラッシュを待たずに発火し得るため、
  // コミットと同期する useLayoutEffect で更新して古いスナップショットの
  // 保存を防ぐ
  const getSnapshotRef = useRef(getSnapshot);
  const saveRef = useRef(save);
  useLayoutEffect(() => {
    getSnapshotRef.current = getSnapshot;
    saveRef.current = save;
  });

  useEffect(() => {
    baselineRef.current = project ? buildBaselineSnapshot(project) : null;
  }, [project]);

  /**
   * 直前の保存（trySave または saveNow）で送信したスナップショット
   * （attempted）と、完了時点の最新スナップショットを比較し、まだ
   * バックグラウンドにいる間に新しい編集が届いていれば retry() で
   * 追い保存する。
   *
   * - Android は inactive を経由せず background の単発イベントのみの
   *   ため、次の AppState イベントを待たずにここで拾う必要がある
   * - 比較対象は baseline ではなく attempted にする: baseline との
   *   比較にすると、保存失敗時に baseline が更新されないため
   *   無限に即時リトライしてしまう。attempted と比較すれば、保存中に
   *   本当に新しい編集が届いた場合のみ追い保存し、同じ内容の失敗を
   *   連続リトライしない（失敗時のリトライは次回の離脱遷移に委ねる）
   * - 既に active に戻っている場合はここでの自動保存を行わない
   * - trySave 自身の再帰呼び出しにも saveNow 完了後の追い保存にも
   *   使う共通ロジックのため、呼び出し先を retry として受け取る
   *   （trySave と scheduleFollowUpIfNeeded の循環参照を避けるため）
   */
  const scheduleFollowUpIfNeeded = useCallback(
    (attempted: ProjectSaveSnapshot, retry: () => void) => {
      const stillBackgrounded =
        appStateRef.current === 'inactive' ||
        appStateRef.current === 'background';
      const latest = getSnapshotRef.current();
      if (stillBackgrounded && isSnapshotDirty(attempted, latest)) {
        retry();
      }
    },
    [],
  );

  /**
   * dirty ならサイレント保存を実行する（保存中は多重実行しない）。
   * AppState リスナーからも自身の完了後の追い保存からも呼ばれる共通経路
   */
  const trySave = useCallback(() => {
    // 保存中は多重実行しない。保存中に届いた新しい編集は、この
    // 保存が完了した時点で（まだバックグラウンドにいる限り）
    // finally 内の再チェックで拾われる
    if (pendingSaveRef.current) return;
    const baseline = baselineRef.current;
    // プロジェクト未ロードの間は保存しない
    if (!baseline) return;

    const current = getSnapshotRef.current();
    if (!isSnapshotDirty(baseline, current)) return;

    pendingSaveRef.current = (async () => {
      try {
        await saveRef.current(current);
        baselineRef.current = current;
      } catch (e) {
        // バックグラウンド遷移中のため UI は出さない。
        // ベースラインを維持することで次の遷移時にリトライされる
        console.warn('Background save failed:', e);
      } finally {
        pendingSaveRef.current = null;
        scheduleFollowUpIfNeeded(current, trySave);
      }
    })();
  }, [scheduleFollowUpIfNeeded]);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      appStateRef.current = nextState;
      // inactive / background へ遷移するたびに毎回チェックする
      // （iOS の active → inactive → background という連鎖遷移の両方の
      // ステップで発火させ、inactive 中に届いた最後の編集も拾う）。
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

  /**
   * 手動保存用: バックグラウンド保存と同じロックを通して現在のスナップ
   * ショットを保存する。進行中のバックグラウンド保存（追い保存の連鎖を
   * 含む）を排出してから実行し、実行中は AppState 遷移による保存を
   * ブロックするため、バックグラウンド PUT と手動 PUT が並走して
   * 古い内容の上書きやサーバー側副作用の重複が起きない。
   * バックグラウンド保存と異なり、失敗時はエラーを throw する
   * （呼び出し元でリトライ UI を出すため）。
   * 手動保存の PUT が in flight の間にアプリがバックグラウンドへ遷移し、
   * さらに新しい編集が届いた場合に備え、完了時も trySave と同じ
   * 追い保存チェックを行う（呼び出し元への reject には影響しない）
   */
  const saveNow = useCallback(async () => {
    // バックグラウンド保存の完了時に追い保存が連鎖起動することがあるため、
    // 進行中の保存がなくなるまでループして完全に排出する
    while (pendingSaveRef.current) {
      await pendingSaveRef.current;
    }
    const current = getSnapshotRef.current();
    let saveError: unknown = null;
    // pendingSaveRef に載せている間は AppState 遷移の trySave が
    // キュー扱いになり、並走 PUT が発生しない（この Promise は reject しない）
    pendingSaveRef.current = (async () => {
      try {
        await saveRef.current(current);
        baselineRef.current = current;
      } catch (e) {
        saveError = e;
      } finally {
        pendingSaveRef.current = null;
        scheduleFollowUpIfNeeded(current, trySave);
      }
    })();
    await pendingSaveRef.current;
    if (saveError) throw saveError;
  }, [scheduleFollowUpIfNeeded, trySave]);

  return { saveNow };
}
