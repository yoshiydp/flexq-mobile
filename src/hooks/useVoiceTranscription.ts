import { useState, useCallback, useRef, useEffect } from 'react';
import { Platform } from 'react-native';

interface UseVoiceTranscriptionReturn {
  isListening: boolean;
  startListening: () => Promise<void>;
  stopListening: () => void;
}

/**
 * アプリ内の音声入力（本文ツールバーのマイクボタン）を提供するかどうか。
 *
 * iOS は expo-speech-recognition の認識結果が本文へ入るまでの待ち時間が長く、
 * 端末標準のキーボード音声入力（ディクテーション）の方が速度・精度とも上回っていたため、
 * アプリ内の音声入力は提供せず OS 標準に委ねる。
 * Android は認識から入力までの反応が速いため従来どおりマイクボタンを提供する（TASK-100）。
 */
export function isInAppVoiceInputSupported(): boolean {
  return Platform.OS !== 'ios';
}

/** 音声入力で利用者に提示するメッセージ */
export const VOICE_TRANSCRIPTION_MESSAGES = {
  unavailable: 'この端末では音声入力を利用できません。',
  permissionDenied:
    '音声入力にはマイクと音声認識の許可が必要です。端末の設定から許可してください。',
  noSpeech: '音声を認識できませんでした。もう一度お試しください。',
  failed: '音声入力を開始できませんでした。',
} as const;

/**
 * 認識開始オプション。
 * `interimResults: true` は途中経過を画面に出すためではなく、
 * 最終結果（isFinal）が届かないまま終了した場合でも `end` で確定できるようにするため
 * （expo-speech-recognition の README でも推奨されている組み合わせ）。
 */
export const VOICE_TRANSCRIPTION_START_OPTIONS = {
  lang: 'ja-JP',
  interimResults: true,
  continuous: false,
  maxAlternatives: 1,
} as const;

/** ネイティブの error イベントコードを利用者向けメッセージへ変換する */
export function resolveVoiceTranscriptionErrorMessage(code?: string): string {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return VOICE_TRANSCRIPTION_MESSAGES.permissionDenied;
    case 'no-speech':
      return VOICE_TRANSCRIPTION_MESSAGES.noSpeech;
    default:
      return VOICE_TRANSCRIPTION_MESSAGES.failed;
  }
}

// expo-speech-recognition requires a custom native build and is unavailable in Expo Go.
// requireNativeModule throws at module evaluation time if the native module isn't registered,
// so we guard with require() inside try/catch instead of a top-level import.
type SpeechMod = typeof import('expo-speech-recognition');
let SpeechModule: SpeechMod | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SpeechModule = require('expo-speech-recognition');
} catch {
  // Running in Expo Go or an environment without the native module
}

type ResultEvent = {
  results?: { transcript?: string }[];
  isFinal?: boolean;
};

type ErrorEvent = {
  error?: string;
  message?: string;
};

export function useVoiceTranscription(
  onResult: (text: string) => void,
  onError?: (message: string) => void,
): UseVoiceTranscriptionReturn {
  const [isListening, setIsListening] = useState(false);
  // 直近に受け取った未確定の文字列。非 continuous モードでは常に発話全体が入る
  const pendingRef = useRef('');
  // このセッションで 1 度でも本文へ反映したか（no-speech の抑制判定に使う）
  const committedRef = useRef(false);
  const startedRef = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  /** 保留中のテキストがあれば本文へ反映する */
  const commitPending = useCallback(() => {
    const text = pendingRef.current.trim();
    pendingRef.current = '';
    if (!text) return;
    committedRef.current = true;
    onResultRef.current(text);
  }, []);

  useEffect(() => {
    if (!SpeechModule || !isInAppVoiceInputSupported()) return;
    const speech = SpeechModule.ExpoSpeechRecognitionModule;

    const subscriptions = [
      speech.addListener('start', () => {
        setIsListening(true);
        pendingRef.current = '';
        committedRef.current = false;
      }),
      speech.addListener('result', (event: ResultEvent) => {
        const transcript = event?.results?.[0]?.transcript ?? '';
        // 非 continuous モードでは transcript が発話全体を保持するため上書きする
        if (transcript.trim()) pendingRef.current = transcript;
        if (event?.isFinal) commitPending();
      }),
      speech.addListener('nomatch', () => {
        if (committedRef.current || pendingRef.current.trim()) return;
        onErrorRef.current?.(VOICE_TRANSCRIPTION_MESSAGES.noSpeech);
      }),
      speech.addListener('error', (event: ErrorEvent) => {
        // no-speech は「無音のまま終了した」だけなので、既に文字が取れていれば黙って終わる
        if (
          event?.error === 'no-speech' &&
          (committedRef.current || pendingRef.current.trim())
        ) {
          return;
        }
        onErrorRef.current?.(resolveVoiceTranscriptionErrorMessage(event?.error));
      }),
      speech.addListener('end', () => {
        // isFinal が届かないまま終了した場合の取りこぼしを防ぐ
        commitPending();
        startedRef.current = false;
        setIsListening(false);
      }),
    ];

    return () => subscriptions.forEach((subscription) => subscription.remove());
  }, [commitPending]);

  // 画面を離れるときに認識を止める（マイクが掴まれたままになるのを防ぐ）
  useEffect(
    () => () => {
      if (!SpeechModule || !startedRef.current) return;
      startedRef.current = false;
      try {
        SpeechModule.ExpoSpeechRecognitionModule.abort();
      } catch {
        // 既に停止済み
      }
    },
    [],
  );

  const startListening = useCallback(async () => {
    if (!SpeechModule || !isInAppVoiceInputSupported()) {
      onErrorRef.current?.(VOICE_TRANSCRIPTION_MESSAGES.unavailable);
      return;
    }
    const speech = SpeechModule.ExpoSpeechRecognitionModule;

    // isRecognitionAvailable() は iOS では端末ロケールの SFSpeechRecognizer を見るため、
    // ja-JP の認識が可能でも false を返しうる。事前ゲートには使わず error イベントに任せる。
    try {
      // iOS はマイクとは別に音声認識（NSSpeechRecognitionUsageDescription）の許可が必要。
      // requestPermissionsAsync が両方まとめて要求する。
      const permission = await speech.requestPermissionsAsync();
      const granted = permission?.granted ?? permission?.status === 'granted';
      if (!granted) {
        onErrorRef.current?.(VOICE_TRANSCRIPTION_MESSAGES.permissionDenied);
        return;
      }

      pendingRef.current = '';
      committedRef.current = false;
      startedRef.current = true;
      speech.start(VOICE_TRANSCRIPTION_START_OPTIONS);
      // start イベントが届かない環境でもボタンの状態が実態と揃うようにしておく
      setIsListening(true);
    } catch (error) {
      console.warn('[VoiceTranscription] failed to start:', error);
      startedRef.current = false;
      pendingRef.current = '';
      setIsListening(false);
      onErrorRef.current?.(VOICE_TRANSCRIPTION_MESSAGES.failed);
    }
  }, []);

  const stopListening = useCallback(() => {
    if (!SpeechModule) {
      setIsListening(false);
      return;
    }
    try {
      SpeechModule.ExpoSpeechRecognitionModule.stop();
    } catch (error) {
      console.warn('[VoiceTranscription] failed to stop:', error);
      commitPending();
      startedRef.current = false;
      setIsListening(false);
    }
  }, [commitPending]);

  return { isListening, startListening, stopListening };
}
