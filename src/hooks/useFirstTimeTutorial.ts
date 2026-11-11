import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isTutorialCompleted,
  markTutorialCompleted,
  type TutorialId,
} from '@/utils/tutorialStorage';

interface Params {
  /** 判定に必要なデータの取得が成功したか（false の間は判定しない） */
  ready: boolean;
  /**
   * すでに使い慣れたユーザーか。true なら表示せずに完了扱いにする
   * （OTA 配信時にリリース済みのユーザー全員へ出さないため）。
   * 判定に API 呼び出しが要る場合は Promise を返してよい（未完了の端末で 1 回だけ呼ばれる）
   */
  shouldSkip: () => boolean | Promise<boolean>;
}

/**
 * 初回チュートリアル・画面ごとの初回ヒントの表示制御（TASK-139 / TASK-140）。
 * - ready になった最初のタイミングで 1 回だけ判定する（画面を開いている間に再判定しない）
 * - 完了済みなら出さない
 * - shouldSkip が true なら出さずに完了を記録する
 * - それ以外は表示する。閉じる（スキップ・最後のボタン・Android の戻る）と完了を記録する
 */
export function useFirstTimeTutorial(
  id: TutorialId,
  { ready, shouldSkip }: Params,
) {
  const [visible, setVisible] = useState(false);
  const decidedRef = useRef(false);
  // 判定はデータが揃った時点の値で行うため、最新の関数を参照する（依存配列で再判定させない）
  const shouldSkipRef = useRef(shouldSkip);
  shouldSkipRef.current = shouldSkip;

  useEffect(() => {
    if (decidedRef.current || !ready) return;
    decidedRef.current = true;

    (async () => {
      if (await isTutorialCompleted(id)) return;
      if (await shouldSkipRef.current()) {
        await markTutorialCompleted(id);
        return;
      }
      setVisible(true);
    })().catch((err) => {
      // 案内はアプリ機能に必須ではないため、失敗しても表示せずに握りつぶす
      console.warn(`Tutorial check failed (${id}):`, err);
    });
  }, [id, ready]);

  const dismiss = useCallback(() => {
    setVisible(false);
    markTutorialCompleted(id).catch((err) => {
      console.warn(`Failed to save tutorial state (${id}):`, err);
    });
  }, [id]);

  return { visible, dismiss };
}
