import { useCallback, useEffect, useRef } from 'react';
import { Platform, View } from 'react-native';

/**
 * 「エディター外タップでキーボードを閉じる」判定の保護領域レジストリ（TASK-58）。
 *
 * iOS では BodyInput がレスポンダを claim することで、親の
 * onStartShouldSetResponder の副作用（blur / Keyboard.dismiss）から
 * エディター内のタップを守っている。しかし Android では RN の JS レスポンダを
 * 親 View が claim すると WebView（tentap エディター）や TextInput への
 * ネイティブタッチ配送が遮断され、フォーカス・スクロール・カーソル移動が
 * できなくなる。
 *
 * そのため Android では claim を行わず、タイトル・エディターなどの入力領域を
 * このレジストリに登録し、タッチ座標が領域内かどうかで副作用の発火を
 * ゲートする方式に切り替える（iOS の挙動には影響しない）。
 */
export type ProtectedRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const rects = new Map<string, ProtectedRect>();

let sequence = 0;

export const setProtectedRect = (key: string, rect: ProtectedRect | null) => {
  if (rect) {
    rects.set(key, rect);
  } else {
    rects.delete(key);
  }
};

/** タッチ座標（ウィンドウ座標）がいずれかの保護領域内にあるか */
export const isPointProtected = (pageX: number, pageY: number): boolean => {
  for (const rect of rects.values()) {
    if (
      pageX >= rect.x &&
      pageX <= rect.x + rect.width &&
      pageY >= rect.y &&
      pageY <= rect.y + rect.height
    ) {
      return true;
    }
  }
  return false;
};

/**
 * Android でタッチが保護領域（入力領域）内なら true を返す。
 * true の場合、キーボードを閉じる副作用を実行してはならない。
 * iOS では常に false（既存のレスポンダ claim 方式が機能しているため）
 */
export const shouldSkipKeyboardDismiss = (event: {
  nativeEvent: { pageX: number; pageY: number };
}): boolean =>
  Platform.OS === 'android' &&
  isPointProtected(event.nativeEvent.pageX, event.nativeEvent.pageY);

/** テスト用: 登録済みの保護領域をすべて削除する */
export const resetProtectedRectsForTesting = () => {
  rects.clear();
};

/**
 * View を保護領域として登録するフック。
 * 返り値の ref / onLayout を保護したい View に渡す。
 * レイアウト変化（キーボード表示によるリサイズ等）のたびに実測し直し、
 * アンマウント時に登録を解除する
 */
export const useKeyboardDismissProtection = () => {
  const keyRef = useRef<string | null>(null);
  if (keyRef.current === null) {
    sequence += 1;
    keyRef.current = `protected-rect-${sequence}`;
  }
  const viewRef = useRef<View>(null);

  const onLayout = useCallback(() => {
    viewRef.current?.measureInWindow((x, y, width, height) => {
      if (keyRef.current) {
        setProtectedRect(keyRef.current, { x, y, width, height });
      }
    });
  }, []);

  useEffect(() => {
    const key = keyRef.current;
    return () => {
      if (key) setProtectedRect(key, null);
    };
  }, []);

  return { ref: viewRef, onLayout };
};
