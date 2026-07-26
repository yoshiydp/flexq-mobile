import { useCallback } from 'react';
import { BackHandler, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

/**
 * Android のシステム back ジェスチャー（画面端の横スワイプ）と
 * ハードウェア戻るボタンによる画面戻りを、画面フォーカス中のみブロックする。
 *
 * - スタックにプッシュされる全画面表示（編集・録音・再生など）での
 *   誤操作による画面戻りを防止する（TASK-67）
 * - UI 上の戻るボタン（navigation.goBack() などのプログラム遷移）には影響しない
 * - モーダル側で後から登録される BackHandler リスナー（BaseModal など）が
 *   優先して呼ばれるため、モーダルを back で閉じる挙動は維持される
 * - iOS では何もしない（スワイプバックの挙動は gestureEnabled で制御済み）
 */
export function useBlockAndroidBackGesture() {
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== 'android') return;

      // true を返すとイベントを消費し、React Navigation の
      // デフォルト動作（goBack / アプリのバックグラウンド化）を抑止する
      const subscription = BackHandler.addEventListener(
        'hardwareBackPress',
        () => true,
      );

      return () => subscription.remove();
    }, []),
  );
}
