import { useCallback, useEffect, useRef } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Android のシステム back ジェスチャー（画面端の横スワイプ）と
 * ハードウェア戻るボタンを、画面フォーカス中のみ横取りする。
 *
 * - `onBack` を渡した場合: back 操作でアプリ内ヘッダーの戻るボタンと同じ処理を呼ぶ
 *   （未保存なら確認モーダル・認証コード入力中はフォームへ戻す、などを経由して
 *   `navigation.goBack()` に至る）。編集系画面はこちらを使う（TASK-113）
 * - `onBack` を渡さない場合: back 操作を無条件にブロックする（TASK-67 の従来挙動）
 * - UI 上の戻るボタン（navigation.goBack() などのプログラム遷移）には影響しない
 * - `onBack` は ref で最新の関数を参照し、リスナーはフォーカス時に一度だけ登録する。
 *   毎レンダー再登録すると、モーダル側で後から登録された BackHandler リスナー
 *   （BaseModal / RecStartModal / RecRecordingModal）より後ろに並んで優先されてしまい、
 *   「モーダル表示中の back はモーダルだけを閉じる」挙動が壊れるため
 * - フルスクリーンローディング（LoadingOverlay）の表示中は、オーバーレイ側の BackHandler が
 *   back を握りつぶすため `onBack` は呼ばれない（保存などの処理中に確認モーダルが開かない）
 * - iOS では何もしない（スワイプバックの挙動は gestureEnabled で制御済み）
 *
 * 注意: この実装は BackHandler（`onBackPressed`）前提。Expo prebuild は
 * `app.json` の `android.predictiveBackGestureEnabled`（既定 false）に従って
 * `enableOnBackInvokedCallback="false"` を書き出しているため有効だが、将来
 * `predictiveBackGestureEnabled: true` にすると Android 13+ では `hardwareBackPress`
 * が発火せず、ブロック・確認モーダルとも効かなくなる（別対応が必要）。
 *
 * @param onBack back 操作時に呼ぶ処理（省略時はブロックのみ）
 */
export function useBlockAndroidBackGesture(onBack?: () => void) {
  const onBackRef = useRef(onBack);

  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;

      // true を返すとイベントを消費し、React Navigation の
      // デフォルト動作（goBack / アプリのバックグラウンド化）を抑止する
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => {
          onBackRef.current?.();
          return true;
        },
      );

      return () => subscription.remove();
    }, []),
  );
}
