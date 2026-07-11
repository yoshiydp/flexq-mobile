import { useEffect, useRef, useState } from 'react';
import { Audio } from 'expo-av';
import { DefaultService } from '@/apiClient/services/DefaultService';
import type { HeadphoneConnection } from '@/hooks/useHeadphonesConnected';

/**
 * enableSync の結果
 * - `'enabled'`: 同時再生を有効化できた
 * - `'no-track'`: プロジェクトにトラック音源がない（削除・差し替え済み等）
 * - `'load-failed'`: トラック音源の読み込みに失敗した
 * - `'headphones-disconnected'`: ロード完了を待つ間にイヤホンが切断された
 * - `'cancelled'`: ロード完了を待つ間に画面を離れた（エラーとして扱わない）
 */
export type EnableSyncResult =
  | 'enabled'
  | 'no-track'
  | 'load-failed'
  | 'headphones-disconnected'
  | 'cancelled';

type UseSyncedTrackPlaybackOptions = {
  /** レコードが紐づくプロジェクト ID。未指定（QuickRecord 由来）の場合は同時再生不可 */
  projectId?: string;
  /** 録音開始時のトラック再生位置（ms）。未保存の既存レコードは 0（トラック先頭）扱い */
  startPositionMs?: number;
  /**
   * 録音時に使用していたトラック音源のソース。
   * ProjectSettings で差し替えた未保存のトラックなど、バックエンドに永続化される前の
   * ソースを優先して使うために指定する。ロード失敗時はプロジェクト詳細の再取得に
   * フォールバックする
   */
  initialTrackSource?: string;
  /** イヤホンの接続状態。wired / bluetooth のときのみ同時再生を有効化できる */
  headphoneConnection: HeadphoneConnection;
};

/**
 * 録音データ（人の声）とプロジェクトのトラック音源を同期して同時再生するためのフック (TASK-37)。
 *
 * 位置の対応: 録音位置 t ⇔ トラック位置 startPositionMs + t
 * - 再生 / 一時停止 / シークは常に録音側の位置を基準にトラック側を追従させる
 * - 録音（声）の再生終了でトラック側も停止する（録音尺をマスターとする）
 * - イヤホンが切断された場合は同時再生を自動で停止する
 */
export function useSyncedTrackPlayback({
  projectId,
  startPositionMs = 0,
  initialTrackSource,
  headphoneConnection,
}: UseSyncedTrackPlaybackOptions) {
  const trackSoundRef = useRef<Audio.Sound | null>(null);
  const syncEnabledRef = useRef(false);
  const trackVolumeRef = useRef(1);
  const isMountedRef = useRef(true);

  const [syncEnabled, setSyncEnabledState] = useState(false);
  const [trackVolume, setTrackVolumeState] = useState(1);
  const [trackLoading, setTrackLoading] = useState(false);

  const headphonesConnected =
    headphoneConnection === 'wired' || headphoneConnection === 'bluetooth';
  const canSync = Boolean(projectId) && headphonesConnected;

  // enableSync のロード中にイヤホンが切断された場合を await 後に検知するための参照
  const canSyncRef = useRef(canSync);
  canSyncRef.current = canSync;

  const setSyncEnabled = (value: boolean) => {
    syncEnabledRef.current = value;
    setSyncEnabledState(value);
  };

  const fetchTrackSource = async (): Promise<string | null> => {
    if (!projectId) return null;
    const res = await DefaultService.getDataProject(projectId);
    return res?.trackSource || null;
  };

  /**
   * トラック音源の Audio.Sound を生成する。
   * 録音時に使用していたソース（initialTrackSource）があればそれを優先し、
   * ない場合はプロジェクト詳細から Presigned URL を取得する。
   * ロードに失敗した場合は TASK-34 と同様に最新の URL を再取得して 1 回だけリトライする。
   */
  const loadTrackSound = async (): Promise<Audio.Sound | 'no-track' | null> => {
    let trackSource: string | null = initialTrackSource || null;
    if (!trackSource) {
      try {
        trackSource = await fetchTrackSource();
      } catch (e) {
        console.error('Failed to fetch project track source:', e);
        return null;
      }
      if (!trackSource) return 'no-track';
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: trackSource },
          { shouldPlay: false, volume: trackVolumeRef.current },
        );
        return sound;
      } catch (e) {
        console.error('Failed to load project track audio:', e);
        if (attempt === 0) {
          try {
            trackSource = await fetchTrackSource();
          } catch (refetchErr) {
            console.error('Failed to refetch project track source:', refetchErr);
            return null;
          }
          if (!trackSource) return 'no-track';
        }
      }
    }
    return null;
  };

  /**
   * トラック同時再生を有効化する。
   * @param recordPositionMs 現在の録音側の再生位置（ms）。トラックを対応位置に合わせる
   */
  const enableSync = async (recordPositionMs: number): Promise<EnableSyncResult> => {
    if (!canSync) return 'load-failed';

    setTrackLoading(true);
    try {
      if (!trackSoundRef.current) {
        const result = await loadTrackSound();

        // ロード完了を待つ間に画面を離れていた場合は適用しない（エラー扱いにもしない）
        if (!isMountedRef.current) {
          if (result && typeof result !== 'string') {
            result.unloadAsync().catch(() => {});
          }
          return 'cancelled';
        }

        if (result === 'no-track') return 'no-track';
        if (!result) return 'load-failed';
        trackSoundRef.current = result;
      }

      // ロード完了を待つ間にイヤホンが切断されていた場合は有効化しない
      // （切断時の自動停止 effect は syncEnabled=false のため何もしない）
      if (!canSyncRef.current) return 'headphones-disconnected';

      try {
        await trackSoundRef.current.setPositionAsync(startPositionMs + recordPositionMs);
      } catch {
        // トラック尺を超える位置などへのシーク失敗は無視する（再生時に再同期される）
      }
      setSyncEnabled(true);
      return 'enabled';
    } finally {
      setTrackLoading(false);
    }
  };

  /** トラック同時再生を無効化する（トラック音源は解放せず保持する） */
  const disableSync = async () => {
    setSyncEnabled(false);
    const track = trackSoundRef.current;
    if (!track) return;
    try {
      await track.pauseAsync();
    } catch {
      // 未ロード時などの停止失敗は無視する
    }
  };

  /** 録音側の再生開始に合わせてトラックを対応位置から再生する */
  const syncPlay = async (recordPositionMs: number) => {
    const track = trackSoundRef.current;
    if (!syncEnabledRef.current || !track) return;
    try {
      await track.playFromPositionAsync(startPositionMs + recordPositionMs);
    } catch (e) {
      console.error('Failed to play project track in sync:', e);
    }
  };

  /** 録音側の一時停止に合わせてトラックも一時停止する */
  const syncPause = async () => {
    const track = trackSoundRef.current;
    if (!syncEnabledRef.current || !track) return;
    try {
      await track.pauseAsync();
    } catch {
      // 停止失敗は無視する
    }
  };

  /** 録音側のシークに合わせてトラックを対応位置へシークする（再生状態は変えない） */
  const syncSeek = async (recordPositionMs: number) => {
    const track = trackSoundRef.current;
    if (!syncEnabledRef.current || !track) return;
    try {
      await track.setPositionAsync(startPositionMs + recordPositionMs);
    } catch {
      // トラック尺を超える位置などへのシーク失敗は無視する
    }
  };

  /**
   * 録音（声）の再生終了時の処理。録音尺をマスターとする。
   * - ループ再生中: トラックを録音開始位置に戻して再生を継続する
   * - 通常再生: トラックを停止して録音開始位置に戻す
   */
  const handleRecordFinish = async (isLooping: boolean) => {
    const track = trackSoundRef.current;
    if (!syncEnabledRef.current || !track) return;
    try {
      if (isLooping) {
        await track.playFromPositionAsync(startPositionMs);
      } else {
        await track.pauseAsync();
        await track.setPositionAsync(startPositionMs);
      }
    } catch (e) {
      console.error('Failed to sync project track on record finish:', e);
    }
  };

  /** トラック側の音量を変更する（声とのバランス調整用） */
  const setTrackVolume = async (value: number) => {
    trackVolumeRef.current = value;
    setTrackVolumeState(value);
    const track = trackSoundRef.current;
    if (!track) return;
    try {
      await track.setVolumeAsync(value);
    } catch {
      // 音量変更失敗は無視する
    }
  };

  // 再生中にイヤホンが切断された場合は同時再生を停止する
  useEffect(() => {
    if (!headphonesConnected && syncEnabledRef.current) {
      disableSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [headphonesConnected]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      const track = trackSoundRef.current;
      if (track) {
        track.stopAsync().catch(() => {});
        track.unloadAsync().catch(() => {});
      }
      trackSoundRef.current = null;
    };
  }, []);

  return {
    /** projectId があり、かつイヤホン接続中のときのみ true */
    canSync,
    syncEnabled,
    trackLoading,
    trackVolume,
    enableSync,
    disableSync,
    syncPlay,
    syncPause,
    syncSeek,
    handleRecordFinish,
    setTrackVolume,
  };
}
