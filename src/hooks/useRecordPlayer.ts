import { useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { AudioManager } from 'react-native-audio-api';
import {
  SyncedAudioPlayer,
  type PlayerSnapshot,
} from '@/utils/syncedAudioPlayer';

/**
 * 録音再生画面の音声エンジン（SyncedAudioPlayer）を React に結び付ける (TASK-121)。
 * - プレイヤーは画面の寿命と同じ 1 インスタンスで、アンマウント時に解放する
 * - 再生位置・尺・再生中かどうかはプレイヤーの通知（100ms 間隔）で state に反映する
 * - iOS の音声セッションは再生専用（playback）にする。録音は expo-av 側の画面で
 *   別途 PlayAndRecord に切り替わる
 * - **この画面にいる間は expo-av を無効化する**（`Audio.setIsEnabledAsync(false)`）。
 *   expo-av（他画面の AVPlayer）と react-native-audio-api（AVAudioEngine）が同時に
 *   音声セッションのカテゴリ・アクティブ化を操作すると、iOS のオーディオサーバーが
 *   デッドロックして "Start: RPC timeout" で abort する（シミュレーターで再現）。
 *   セッションの管理者を audio-api 側の 1 つにするため、AudioContext を作る前に
 *   expo-av を止め、画面を離れるときに戻す
 * - 電話などの割り込みが始まったら一時停止する
 */
export function useRecordPlayer() {
  const playerRef = useRef<SyncedAudioPlayer | null>(null);
  if (!playerRef.current) {
    playerRef.current = new SyncedAudioPlayer({
      prepare: () => Audio.setIsEnabledAsync(false),
    });
  }
  const player = playerRef.current;

  const [snapshot, setSnapshot] = useState<PlayerSnapshot>(() =>
    player.getSnapshot(),
  );

  useEffect(() => {
    const unsubscribe = player.subscribe(setSnapshot);
    try {
      AudioManager.setAudioSessionOptions({
        iosCategory: 'playback',
        iosMode: 'default',
        iosOptions: [],
      });
      AudioManager.observeAudioInterruptions(true);
    } catch (e) {
      console.error('Failed to configure the audio session:', e);
    }
    const subscription = AudioManager.addSystemEventListener(
      'interruption',
      (event) => {
        if (event.type === 'began') player.pause();
      },
    );
    return () => {
      unsubscribe();
      subscription?.remove();
      try {
        AudioManager.observeAudioInterruptions(false);
      } catch {
        // 解除失敗は無視する
      }
      player.release();
      // 他画面の expo-av（トラック再生・録音）を再び使えるようにする
      Audio.setIsEnabledAsync(true).catch((e) => {
        console.error('Failed to re-enable expo-av:', e);
      });
    };
  }, [player]);

  return {
    player,
    positionMs: snapshot.positionMs,
    durationMs: snapshot.durationMs,
    isPlaying: snapshot.isPlaying,
  };
}
