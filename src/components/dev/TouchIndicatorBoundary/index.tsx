import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  LogBox,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';
import { COLORS } from '@/globalStyles';

/**
 * ヒント動画（TASK-140）の撮影用に、触った位置へ印を出す。
 * 画面収録には指が映らないため「どこを・何回・どれだけ押したか」を見せる。
 *
 * - 開発ビルド（__DEV__）で EXPO_PUBLIC_SHOW_TOUCHES=1 を付けて Metro を起動したときだけ有効。
 *   EAS Update（dev / staging / production）の配信と本番ビルドには出ない
 * - 押している間は丸い印が残り、ゆっくり脈打つ（長押しが分かる）。離すと波紋が広がって消える
 *   （タップは一瞬の印 + 波紋、ダブルタップは波紋が 2 つ続けて出る）
 * - RN の Modal は別のウィンドウに描画されるため、ルート（_layout）だけでなく
 *   撮影に映る Modal（BaseModal / 録音の Modal / チュートリアル）の中にも置く。
 *   タッチイベントは React の木を伝って外側の境界にも届くため、内側で処理済みの印を付けて二重に描かない
 */
export function isTouchIndicatorEnabled(): boolean {
  // EXPO_PUBLIC_ の値はバンドル時に埋め込まれる。本番バンドルは __DEV__ が false なので常に無効
  return __DEV__ && process.env.EXPO_PUBLIC_SHOW_TOUCHES === '1';
}

const DOT_SIZE = 46;
const RELEASE_MS = 450;
// 離したイベントを取りこぼした印（ネイティブのスクロールに奪われたときなど）を消すまでの時間
const STALE_MS = 10000;

interface Mark {
  key: number;
  position: Animated.ValueXY;
  /** 押している間の脈動（0 → 1 を繰り返す） */
  pulse: Animated.Value;
  /** 離したあとの波紋（0 → 1） */
  release: Animated.Value;
}

type TouchPoint = { identifier: number | string; pageX: number; pageY: number };

const HANDLED = '__touchIndicatorHandled';

function changedTouches(e: GestureResponderEvent): TouchPoint[] {
  const ne = e.nativeEvent as unknown as {
    changedTouches?: TouchPoint[];
  } & TouchPoint;
  return ne.changedTouches?.length ? ne.changedTouches : [ne];
}

/** このイベントを先に処理した境界（内側の Modal）があれば true。なければ処理済みにする */
function claim(e: GestureResponderEvent, phase: string): boolean {
  const ne = e.nativeEvent as unknown as Record<string, unknown>;
  if (ne[HANDLED] === phase) return true;
  ne[HANDLED] = phase;
  return false;
}

function TouchIndicatorLayer({ children }: { children: React.ReactNode }) {
  const [marks, setMarks] = useState<Mark[]>([]);
  const active = useRef(new Map<string, Mark>());
  const nextKey = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    // 撮影中は開発用のエラー・警告の表示（LogBox）が映り込まないようにする（ログは Metro に出る）
    LogBox.ignoreAllLogs(true);
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const remove = useCallback((key: number) => {
    setMarks((prev) => prev.filter((m) => m.key !== key));
  }, []);

  const release = useCallback(
    (id: string) => {
      const mark = active.current.get(id);
      if (!mark) return;
      active.current.delete(id);
      mark.pulse.stopAnimation();
      Animated.timing(mark.release, {
        toValue: 1,
        duration: RELEASE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => remove(mark.key));
    },
    [remove],
  );

  const onTouchStart = (e: GestureResponderEvent) => {
    if (claim(e, 'start')) return;
    const added: Mark[] = [];
    for (const t of changedTouches(e)) {
      const id = String(t.identifier);
      // 同じ identifier が離す前に再び届いた場合は前の印を離した扱いにする
      release(id);
      const mark: Mark = {
        key: nextKey.current++,
        position: new Animated.ValueXY({ x: t.pageX, y: t.pageY }),
        pulse: new Animated.Value(0),
        release: new Animated.Value(0),
      };
      active.current.set(id, mark);
      added.push(mark);
      Animated.loop(
        Animated.timing(mark.pulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ).start();
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        if (active.current.get(id) === mark) release(id);
      }, STALE_MS);
      timers.current.add(timer);
    }
    setMarks((prev) => [...prev, ...added]);
  };

  const onTouchMove = (e: GestureResponderEvent) => {
    if (claim(e, 'move')) return;
    for (const t of changedTouches(e)) {
      active.current.get(String(t.identifier))?.position.setValue({
        x: t.pageX,
        y: t.pageY,
      });
    }
  };

  const onTouchEnd = (e: GestureResponderEvent) => {
    if (claim(e, 'end')) return;
    for (const t of changedTouches(e)) release(String(t.identifier));
  };

  return (
    <View
      style={styles.root}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {children}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        {marks.map((mark) => (
          <Animated.View
            key={mark.key}
            style={[
              styles.mark,
              {
                transform: [
                  { translateX: Animated.subtract(mark.position.x, DOT_SIZE / 2) },
                  { translateY: Animated.subtract(mark.position.y, DOT_SIZE / 2) },
                ],
              },
            ]}
          >
            {/* 離したあとに広がって消える波紋 */}
            <Animated.View
              style={[
                styles.ripple,
                {
                  opacity: mark.release.interpolate({
                    inputRange: [0, 0.05, 1],
                    outputRange: [0, 0.9, 0],
                  }),
                  transform: [
                    {
                      scale: mark.release.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, 2.2],
                      }),
                    },
                  ],
                },
              ]}
            />
            {/* 押している間の印（脈打つ） */}
            <Animated.View
              style={[
                styles.dot,
                {
                  opacity: mark.release.interpolate({
                    inputRange: [0, 0.4],
                    outputRange: [1, 0],
                    extrapolate: 'clamp',
                  }),
                  transform: [
                    {
                      scale: mark.pulse.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [1, 1.15, 1],
                      }),
                    },
                  ],
                },
              ]}
            />
          </Animated.View>
        ))}
      </View>
    </View>
  );
}

export default function TouchIndicatorBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isTouchIndicatorEnabled()) return <>{children}</>;
  return <TouchIndicatorLayer>{children}</TouchIndicatorLayer>;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  mark: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: DOT_SIZE,
    height: DOT_SIZE,
  },
  dot: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    borderWidth: 2,
    borderColor: COLORS.accent.goldPrimary,
  },
  ripple: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DOT_SIZE / 2,
    borderWidth: 3,
    borderColor: COLORS.accent.goldPrimary,
  },
});
