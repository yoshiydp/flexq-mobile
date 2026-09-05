import { act, renderHook } from '@testing-library/react-native';
import {
  useVoiceTranscription,
  VOICE_TRANSCRIPTION_MESSAGES,
  VOICE_TRANSCRIPTION_START_OPTIONS,
  resolveVoiceTranscriptionErrorMessage,
} from './useVoiceTranscription';

type Listener = (event?: unknown) => void;

const listeners: Record<string, Listener[]> = {};

const emit = (event: string, payload?: unknown) => {
  (listeners[event] ?? []).forEach((listener) => listener(payload));
};

const mockModule = {
  addListener: jest.fn((event: string, listener: Listener) => {
    listeners[event] = [...(listeners[event] ?? []), listener];
    return {
      remove: () => {
        listeners[event] = (listeners[event] ?? []).filter((l) => l !== listener);
      },
    };
  }),
  start: jest.fn(),
  stop: jest.fn(),
  abort: jest.fn(),
  isRecognitionAvailable: jest.fn(() => true),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
};

jest.mock('expo-speech-recognition', () => ({
  get ExpoSpeechRecognitionModule() {
    return mockModule;
  },
}));

describe('useVoiceTranscription (TASK-91)', () => {
  beforeEach(() => {
    Object.keys(listeners).forEach((key) => delete listeners[key]);
    jest.clearAllMocks();
    mockModule.isRecognitionAvailable.mockReturnValue(true);
    mockModule.requestPermissionsAsync.mockResolvedValue({
      granted: true,
      status: 'granted',
    });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const setup = () => {
    const onResult = jest.fn();
    const onError = jest.fn();
    const view = renderHook(() => useVoiceTranscription(onResult, onError));
    return { onResult, onError, ...view };
  };

  it('権限が許可されたら認識を開始し、点灯状態になる', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.startListening();
    });

    expect(mockModule.requestPermissionsAsync).toHaveBeenCalled();
    expect(mockModule.start).toHaveBeenCalledWith(VOICE_TRANSCRIPTION_START_OPTIONS);
    expect(result.current.isListening).toBe(true);
  });

  it('日本語ロケールと interim 有効で開始する', () => {
    expect(VOICE_TRANSCRIPTION_START_OPTIONS.lang).toBe('ja-JP');
    expect(VOICE_TRANSCRIPTION_START_OPTIONS.interimResults).toBe(true);
  });

  it('権限が拒否されたら開始せず案内を出し、点灯しない', async () => {
    mockModule.requestPermissionsAsync.mockResolvedValue({
      granted: false,
      status: 'denied',
    });
    const { result, onError } = setup();

    await act(async () => {
      await result.current.startListening();
    });

    expect(mockModule.start).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(VOICE_TRANSCRIPTION_MESSAGES.permissionDenied);
    expect(result.current.isListening).toBe(false);
  });

  it('isRecognitionAvailable() の結果では開始をブロックしない（iOS は端末ロケール依存で false を返しうるため）', async () => {
    mockModule.isRecognitionAvailable.mockReturnValue(false);
    const { result, onError } = setup();

    await act(async () => {
      await result.current.startListening();
    });

    expect(mockModule.start).toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('service-not-allowed のエラーは権限の案内へ変換する', async () => {
    const { result, onError } = setup();

    await act(async () => {
      await result.current.startListening();
    });
    act(() => {
      emit('start');
      emit('error', { error: 'service-not-allowed', message: 'no service' });
      emit('end');
    });

    expect(onError).toHaveBeenCalledWith(VOICE_TRANSCRIPTION_MESSAGES.permissionDenied);
  });

  it('start が例外を投げたら点灯を解除して案内を出す', async () => {
    mockModule.start.mockImplementationOnce(() => {
      throw new Error('native failure');
    });
    const { result, onError } = setup();

    await act(async () => {
      await result.current.startListening();
    });

    expect(result.current.isListening).toBe(false);
    expect(onError).toHaveBeenCalledWith(VOICE_TRANSCRIPTION_MESSAGES.failed);
  });

  it('最終結果を本文へ反映する', async () => {
    const { result, onResult } = setup();

    await act(async () => {
      await result.current.startListening();
    });
    act(() => {
      emit('start');
      emit('result', { results: [{ transcript: 'こんにちは' }], isFinal: true });
    });

    expect(onResult).toHaveBeenCalledWith('こんにちは');
  });

  it('isFinal が届かないまま終了しても、途中経過を本文へ反映する', async () => {
    const { result, onResult } = setup();

    await act(async () => {
      await result.current.startListening();
    });
    act(() => {
      emit('start');
      emit('result', { results: [{ transcript: 'とちゅう' }], isFinal: false });
      emit('result', { results: [{ transcript: 'とちゅうけいか' }], isFinal: false });
      emit('end');
    });

    expect(onResult).toHaveBeenCalledTimes(1);
    expect(onResult).toHaveBeenCalledWith('とちゅうけいか');
    expect(result.current.isListening).toBe(false);
  });

  it('最終結果を反映済みなら end で二重挿入しない', async () => {
    const { result, onResult } = setup();

    await act(async () => {
      await result.current.startListening();
    });
    act(() => {
      emit('start');
      emit('result', { results: [{ transcript: 'かくてい' }], isFinal: false });
      emit('result', { results: [{ transcript: 'かくてい' }], isFinal: true });
      emit('end');
    });

    expect(onResult).toHaveBeenCalledTimes(1);
  });

  it('エラーイベントで点灯を解除して案内を出す', async () => {
    const { result, onError } = setup();

    await act(async () => {
      await result.current.startListening();
    });
    act(() => {
      emit('start');
      emit('error', { error: 'not-allowed', message: 'denied' });
      emit('end');
    });

    expect(onError).toHaveBeenCalledWith(VOICE_TRANSCRIPTION_MESSAGES.permissionDenied);
    expect(result.current.isListening).toBe(false);
  });

  it('文字が取れている場合の no-speech は案内を出さない', async () => {
    const { result, onError } = setup();

    await act(async () => {
      await result.current.startListening();
    });
    act(() => {
      emit('start');
      emit('result', { results: [{ transcript: 'とれている' }], isFinal: true });
      emit('error', { error: 'no-speech', message: 'no speech' });
      emit('end');
    });

    expect(onError).not.toHaveBeenCalled();
  });

  it('無音のまま終わった場合は no-speech の案内を出す', async () => {
    const { result, onError } = setup();

    await act(async () => {
      await result.current.startListening();
    });
    act(() => {
      emit('start');
      emit('error', { error: 'no-speech', message: 'no speech' });
      emit('end');
    });

    expect(onError).toHaveBeenCalledWith(VOICE_TRANSCRIPTION_MESSAGES.noSpeech);
  });

  it('nomatch でも案内を出す', async () => {
    const { result, onError } = setup();

    await act(async () => {
      await result.current.startListening();
    });
    act(() => {
      emit('start');
      emit('nomatch');
      emit('end');
    });

    expect(onError).toHaveBeenCalledWith(VOICE_TRANSCRIPTION_MESSAGES.noSpeech);
  });

  it('停止でネイティブの stop を呼ぶ', async () => {
    const { result } = setup();

    await act(async () => {
      await result.current.startListening();
    });
    act(() => {
      emit('start');
      result.current.stopListening();
    });

    expect(mockModule.stop).toHaveBeenCalled();
  });

  it('アンマウント時に認識を中断する', async () => {
    const { result, unmount } = setup();

    await act(async () => {
      await result.current.startListening();
    });
    unmount();

    expect(mockModule.abort).toHaveBeenCalled();
  });

  it('エラーコードをメッセージへ変換する', () => {
    expect(resolveVoiceTranscriptionErrorMessage('not-allowed')).toBe(
      VOICE_TRANSCRIPTION_MESSAGES.permissionDenied,
    );
    expect(resolveVoiceTranscriptionErrorMessage('service-not-allowed')).toBe(
      VOICE_TRANSCRIPTION_MESSAGES.permissionDenied,
    );
    expect(resolveVoiceTranscriptionErrorMessage('no-speech')).toBe(
      VOICE_TRANSCRIPTION_MESSAGES.noSpeech,
    );
    expect(resolveVoiceTranscriptionErrorMessage('network')).toBe(
      VOICE_TRANSCRIPTION_MESSAGES.failed,
    );
    expect(resolveVoiceTranscriptionErrorMessage(undefined)).toBe(
      VOICE_TRANSCRIPTION_MESSAGES.failed,
    );
  });
});
