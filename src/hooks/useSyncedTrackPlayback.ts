import { useEffect, useRef, useState } from 'react';
import type { AudioBuffer } from 'react-native-audio-api';
import { DefaultService } from '@/apiClient/services/DefaultService';
import type { HeadphoneConnection } from '@/hooks/useHeadphonesConnected';
import {
  cacheKeyForRemoteUri,
  isRemoteUri,
  resolveCachedRecordAudio,
} from '@/utils/recordAudioCache';
import type { SyncedAudioPlayer } from '@/utils/syncedAudioPlayer';

export type EnableSyncResult =
  | 'enabled'
  | 'enabled-streaming'
  | 'no-track'
  | 'load-failed'
  | 'headphones-disconnected'
  | 'cancelled';

interface UseSyncedTrackPlaybackOptions {
  /** 声とトラックを同時再生するプレイヤー（録音再生画面が所有する） */
  player: SyncedAudioPlayer;
  /** プロジェクト録音のみ同時再生の対象。QuickRecord 由来（undefined）は対象外 */
  projectId?: string;
  /**
   * 録音開始時のトラック位置（ms）。録音位置 t ⇔ トラック位置 startPositionMs + t。
   * 負の値（録音がトラックの発音より先に始まったテイク）も受け付ける (TASK-89)
   */
  startPositionMs?: number;
  /** 未保存のトラック差し替えなど、プロジェクト詳細より優先して使うトラック音源 */
  initialTrackSource?: string;
  headphoneConnection: HeadphoneConnection;
  /** 声のみ（AI 分離済み音源）はイヤホン未接続でも同時再生を許可する (TASK-38) */
  allowWithoutHeadphones?: boolean;
}

/**
 * トラック同時再生の有効化条件・トラック音源の解決（ローカルキャッシュ）・音量を管理する。
 *
 * 再生の同期そのものは SyncedAudioPlayer が担う（TASK-121）。声とトラックを同じ
 * AudioContext の時計で予約再生するため、以前の expo-av 方式にあった実測補正・
 * ミュート合流・ストール学習・ドリフト監視（TASK-61/118/119/120）はすべて不要になった。
 * このフックの責務は「どのトラック音源を、どの開始位置でプレイヤーに渡すか」だけになる。
 */
export function useSyncedTrackPlayback({
  player,
  projectId,
  startPositionMs = 0,
  initialTrackSource,
  headphoneConnection,
  allowWithoutHeadphones = false,
}: UseSyncedTrackPlaybackOptions) {
  const trackBufferRef = useRef<AudioBuffer | null>(null);
  const syncEnabledRef = useRef(false);
  const isMountedRef = useRef(true);

  const [syncEnabled, setSyncEnabledState] = useState(false);
  const [trackVolume, setTrackVolumeState] = useState(1);
  const [trackLoading, setTrackLoading] = useState(false);
  /**
   * トラック音源の取得元（local = キャッシュ済みファイル / remote = ストリーミング
   * フォールバック）。実機でキャッシュ失敗の切り分けに使う可視化用 (TASK-89)
   */
  const [trackPlaybackSource, setTrackPlaybackSource] = useState<
    'local' | 'remote' | null
  >(null);

  const headphonesConnected =
    headphoneConnection === 'wired' || headphoneConnection === 'bluetooth';
  const canSync =
    Boolean(projectId) && (headphonesConnected || allowWithoutHeadphones);

  // enableSync のロード中に有効化条件を失った場合を await 後に検知するための参照
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
   * トラック音源（S3 Presigned URL）を再生用のローカルファイルに解決する (TASK-89)。
   * 同時再生の有効化時にダウンロード（2 回目以降はキャッシュ）してからデコードする。
   * ローカル URI（未保存のトラック差し替え等）はそのまま返す。
   * ダウンロードに失敗した場合は最新の Presigned URL を再取得してもう一度ダウンロードし、
   * それでも失敗した場合だけ URL から直接デコードする（ストリーミングフォールバック /
   * TASK-117。以前は初回の失敗で無通知のまま落ちていたため、URL の期限切れや一時的な
   * 通信エラーがテスターから「出だしの引っかかり」として報告された）
   */
  const resolveTrackPlaybackUri = async (
    source: string,
    forceRefresh: boolean,
  ): Promise<{ uri: string; source: string; playbackSource: 'local' | 'remote' }> => {
    if (!isRemoteUri(source)) {
      setTrackPlaybackSource('local');
      return { uri: source, source, playbackSource: 'local' };
    }
    let candidate = source;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const cached = await resolveCachedRecordAudio(
          candidate,
          cacheKeyForRemoteUri('track', candidate),
          { forceRefresh: forceRefresh || attempt > 0 },
        );
        setTrackPlaybackSource('local');
        return { uri: cached.uri, source: candidate, playbackSource: 'local' };
      } catch (e) {
        console.error('Failed to cache project track audio:', e);
      }
      if (forceRefresh || attempt > 0) break;
      // Presigned URL の期限切れ・一時的な通信エラーに備えて最新 URL を取り直す。
      // ProjectSettings で差し替えた未保存のトラック（initialTrackSource）はサーバー側の
      // 保存済みトラックと別の音源のため、同じ S3 オブジェクトを指す URL のときだけ
      // 採用し、別の音源なら選択中のソースのままストリーミングに落とす
      try {
        const fresh = await fetchTrackSource();
        if (
          !fresh ||
          !isRemoteUri(fresh) ||
          cacheKeyForRemoteUri('track', fresh) !==
            cacheKeyForRemoteUri('track', candidate)
        ) {
          break;
        }
        candidate = fresh;
      } catch (refetchErr) {
        console.error('Failed to refetch project track source:', refetchErr);
        break;
      }
    }
    console.error('Falling back to streaming decode for project track audio');
    setTrackPlaybackSource('remote');
    return { uri: candidate, source: candidate, playbackSource: 'remote' };
  };

  const loadTrackBuffer = async (): Promise<
    { buffer: AudioBuffer; playbackSource: 'local' | 'remote' } | 'no-track' | null
  > => {
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
      const resolved = await resolveTrackPlaybackUri(trackSource, attempt > 0);
      // キャッシュ側で URL を再取得した場合は以降のリトライでもその URL を使う
      trackSource = resolved.source;
      if (!isMountedRef.current) return null;
      try {
        const buffer = await player.decode(resolved.uri);
        return { buffer, playbackSource: resolved.playbackSource };
      } catch (e) {
        console.error('Failed to decode project track audio:', e);
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
   * トラック同時再生を有効化する。再生中に有効化した場合はプレイヤーがその時点の
   * 対応位置から即座に合流させる
   */
  const enableSync = async (): Promise<EnableSyncResult> => {
    if (!canSync) return 'load-failed';

    // 今回のロードでトラック音源がストリーミングフォールバックになったか (TASK-117)
    let streamingFallback = false;
    setTrackLoading(true);
    try {
      if (!trackBufferRef.current) {
        const result = await loadTrackBuffer();

        // ロード完了を待つ間に画面を離れていた場合は適用しない（エラー扱いにもしない）
        if (!isMountedRef.current) return 'cancelled';

        if (result === 'no-track') return 'no-track';
        if (!result) return 'load-failed';
        trackBufferRef.current = result.buffer;
        streamingFallback = result.playbackSource === 'remote';
      }

      // ロード完了を待つ間にイヤホンの切断などで有効化条件を失った場合は有効化しない
      // （自動停止 effect は syncEnabled=false のため何もしない）
      if (!canSyncRef.current) return 'headphones-disconnected';

      player.setTrack(trackBufferRef.current, startPositionMs);
      setSyncEnabled(true);
      return streamingFallback ? 'enabled-streaming' : 'enabled';
    } finally {
      if (isMountedRef.current) setTrackLoading(false);
    }
  };

  /** トラック同時再生を無効化する（デコード済みのトラックは再有効化に備えて保持する） */
  const disableSync = async () => {
    setSyncEnabled(false);
    player.setTrack(null, startPositionMs);
  };

  /** トラック側の音量を変更する（声とのバランス調整用） */
  const setTrackVolume = async (value: number) => {
    setTrackVolumeState(value);
    player.setTrackVolume(value);
  };

  // 再生中に有効化条件を失った場合は同時再生を停止する。
  // - 元の録音（allowWithoutHeadphones=false）: イヤホンの切断で停止する（TASK-37 の従来仕様）
  // - 声のみ（allowWithoutHeadphones=true）: イヤホンが切断されても canSync が維持される
  //   ため停止せず、そのままスピーカーで再生を継続する (TASK-38)
  // - 声のみ + イヤホン未接続で同時再生中に「元の録音」へ戻した場合は canSync が false に
  //   なるため自動で無効化する
  useEffect(() => {
    if (!canSync && syncEnabledRef.current) {
      disableSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSync]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      trackBufferRef.current = null;
    };
  }, []);

  return {
    /** projectId があり、かつイヤホン接続中（または allowWithoutHeadphones=true）のときのみ true */
    canSync,
    syncEnabled,
    trackLoading,
    /** トラック音源の取得元（可視化用）: local = キャッシュ / remote = ストリーミング */
    trackPlaybackSource,
    trackVolume,
    enableSync,
    disableSync,
    setTrackVolume,
  };
}
