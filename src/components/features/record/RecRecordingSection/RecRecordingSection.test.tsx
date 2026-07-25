import React from 'react';
import { Alert, AppState } from 'react-native';
import { render, act, fireEvent } from '@testing-library/react-native';
import RecRecordingSection from './index';
import { REC_PERMISSION_MESSAGES } from '@/constants/messages';

const mockRequestPermissionsAsync = jest.fn();
const mockSetAudioModeAsync = jest.fn();
const mockPrepareToRecordAsync = jest.fn();
const mockStartAsync = jest.fn();
const mockStopAndUnloadAsync = jest.fn();
const mockRecordingGetStatusAsync = jest.fn();
const mockCreateAsync = jest.fn();
const mockStopAsync = jest.fn();
const mockUnloadAsync = jest.fn();
const mockSoundGetStatusAsync = jest.fn();

jest.mock('expo-av', () => {
  return {
    InterruptionModeAndroid: { DoNotMix: 1, DuckOthers: 2 },
    Audio: {
      // recordingOptions.ts が参照する録音定数（enum）は実物を使う
      IOSOutputFormat: jest.requireActual(
        'expo-av/build/Audio/RecordingConstants'
      ).IOSOutputFormat,
      requestPermissionsAsync: (...args: unknown[]) =>
        mockRequestPermissionsAsync(...args),
      setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
      Recording: jest.fn().mockImplementation(() => ({
        prepareToRecordAsync: mockPrepareToRecordAsync,
        startAsync: mockStartAsync,
        stopAndUnloadAsync: mockStopAndUnloadAsync,
        getStatusAsync: mockRecordingGetStatusAsync,
        getURI: jest.fn(() => 'mock-recording-uri'),
      })),
      Sound: {
        createAsync: (...args: unknown[]) => mockCreateAsync(...args),
      },
    },
  };
});

describe('RecRecordingSection コンポーネント', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});

    // react-native の jest モックでは currentState が jest.fn のため明示的に設定する
    (AppState as unknown as { currentState: string }).currentState = 'active';

    // デフォルトは許可済み・全処理成功
    mockRequestPermissionsAsync.mockResolvedValue({ granted: true });
    mockSetAudioModeAsync.mockResolvedValue(undefined);
    mockPrepareToRecordAsync.mockResolvedValue(undefined);
    mockStartAsync.mockResolvedValue(undefined);
    mockStopAndUnloadAsync.mockResolvedValue(undefined);
    mockStopAsync.mockResolvedValue(undefined);
    mockUnloadAsync.mockResolvedValue(undefined);
    mockCreateAsync.mockResolvedValue({
      sound: {
        stopAsync: mockStopAsync,
        unloadAsync: mockUnloadAsync,
        getStatusAsync: mockSoundGetStatusAsync,
      },
    });
    // 実測 startPositionMs 用のステータス（デフォルト: 両者とも動作中）
    mockRecordingGetStatusAsync.mockResolvedValue({
      canRecord: true,
      isRecording: true,
      durationMillis: 83,
    });
    mockSoundGetStatusAsync.mockResolvedValue({
      isLoaded: true,
      isPlaying: true,
      positionMillis: 2683,
    });
  });

  afterEach(() => {
    alertSpy.mockRestore();
    jest.useRealTimers();
  });

  const mockOnStop = jest.fn();
  const mockOnAbort = jest.fn();
  const mockProps = {
    onStop: mockOnStop,
    onAbort: mockOnAbort,
    countdownSeconds: 5,
  };

  // マイク許可の解決などの pending な Promise を反映する
  const flushAsync = async () => {
    await act(async () => {});
  };

  const advanceTimers = async (ms: number) => {
    await act(async () => {
      jest.advanceTimersByTime(ms);
    });
  };

  it('コンポーネントが正しくレンダリングされる', () => {
    const { getByText } = render(<RecRecordingSection {...mockProps} />);
    getByText('5');
  });

  it('trackSource なしでレンダリングされる', () => {
    const { getByText } = render(
      <RecRecordingSection {...mockProps} trackSource={null} />,
    );
    getByText('5');
  });

  it('trackSource ありでレンダリングされる', () => {
    const { getByText } = render(
      <RecRecordingSection
        {...mockProps}
        trackSource="https://example.com/track.mp3"
      />,
    );
    getByText('5');
  });

  it('許可ダイアログの応答前はカウントダウンが進まず、許可後に開始される', async () => {
    let resolvePermission: (value: { granted: boolean }) => void = () => {};
    mockRequestPermissionsAsync.mockReturnValue(
      new Promise((resolve) => {
        resolvePermission = resolve;
      }),
    );

    const { getByText } = render(<RecRecordingSection {...mockProps} />);

    // ダイアログ応答待ちの間はカウントダウンが開始されない
    await advanceTimers(3000);
    getByText('5');

    // 許可後にカウントダウンが開始される
    await act(async () => {
      resolvePermission({ granted: true });
    });
    await advanceTimers(1000);
    getByText('4');
  });

  it('アンマウント時に音声モードを再生向け設定（DuckOthers）に戻す (TASK-57)', async () => {
    const { unmount } = render(<RecRecordingSection {...mockProps} />);
    await flushAsync();

    mockSetAudioModeAsync.mockClear();
    unmount();

    // 録音用の DoNotMix / allowsRecordingIOS がグローバルに残らないこと
    expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      interruptionModeAndroid: 2,
    });
  });

  it('許可 granted 後にカウントダウン → 録音開始・タイマーが起動する', async () => {
    const { getByText } = render(
      <RecRecordingSection
        {...mockProps}
        trackSource="https://example.com/track.mp3"
        startPositionMs={2000}
      />,
    );

    await flushAsync();
    expect(mockRequestPermissionsAsync).toHaveBeenCalledTimes(1);

    // カウントダウン 5 秒経過で録音が開始される
    await advanceTimers(5000);
    await flushAsync();

    expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: false,
      // 録音中は他アプリと音声をミックスせず、音声フォーカスを専有する
      interruptionModeAndroid: 1,
    });
    expect(mockPrepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(mockStartAsync).toHaveBeenCalledTimes(1);

    // トラック音源が指定位置から再生される
    expect(mockCreateAsync).toHaveBeenCalledWith(
      { uri: 'https://example.com/track.mp3' },
      { shouldPlay: true, positionMillis: 2000, volume: 1.0 },
    );

    // トラックは録音より先に起動する（起動遅延が実測 startPositionMs で
    // 補正できるよう、実測値が負にならない順序にする / TASK-44）
    expect(mockCreateAsync.mock.invocationCallOrder[0]).toBeLessThan(
      mockStartAsync.mock.invocationCallOrder[0],
    );

    // タイマーが起動している
    await advanceTimers(1000);
    getByText('00:01:00');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockOnAbort).not.toHaveBeenCalled();
  });

  it('実測した録音開始位置（トラック位置 − 録音経過時間）を onStop で引き渡す', async () => {
    const { getByTestId } = render(
      <RecRecordingSection
        {...mockProps}
        trackSource="https://example.com/track.mp3"
        startPositionMs={2000}
      />,
    );

    await flushAsync();
    await advanceTimers(5000);
    await flushAsync();

    // トラック位置 2683ms − 録音経過 83ms = 2600ms が実測値になる
    fireEvent.press(getByTestId('rec-recording-section-pressable'));
    await flushAsync();

    expect(mockOnStop).toHaveBeenCalledWith(
      expect.any(Number),
      'mock-recording-uri',
      2600,
    );
  });

  it('実測できなかった場合（トラックが再生状態にならない）は onStop の実測値が undefined になる', async () => {
    mockSoundGetStatusAsync.mockResolvedValue({
      isLoaded: true,
      isPlaying: false,
      positionMillis: 2000,
    });

    const { getByTestId } = render(
      <RecRecordingSection
        {...mockProps}
        trackSource="https://example.com/track.mp3"
        startPositionMs={2000}
      />,
    );

    await flushAsync();
    await advanceTimers(5000);
    await flushAsync();
    // 実測リトライ（100ms × 20 回）を消化する
    await advanceTimers(2500);

    fireEvent.press(getByTestId('rec-recording-section-pressable'));
    await flushAsync();

    expect(mockOnStop).toHaveBeenCalledWith(
      expect.any(Number),
      'mock-recording-uri',
      undefined,
    );
  });

  it('許可拒否時に Alert が表示され、録音が開始されない', async () => {
    mockRequestPermissionsAsync.mockResolvedValue({
      granted: false,
      canAskAgain: false,
    });

    const { getByText } = render(<RecRecordingSection {...mockProps} />);
    await flushAsync();

    expect(alertSpy).toHaveBeenCalledWith(
      'エラー',
      REC_PERMISSION_MESSAGES.micPermissionDenied,
    );
    expect(mockOnAbort).toHaveBeenCalledTimes(1);

    // カウントダウン・録音とも開始されない
    await advanceTimers(6000);
    getByText('5');
    expect(mockSetAudioModeAsync).not.toHaveBeenCalled();
    expect(mockPrepareToRecordAsync).not.toHaveBeenCalled();
  });

  it('許可リクエスト自体が失敗した場合も Alert が表示され、録音が開始されない', async () => {
    mockRequestPermissionsAsync.mockRejectedValue(new Error('request failed'));

    render(<RecRecordingSection {...mockProps} />);
    await flushAsync();

    expect(alertSpy).toHaveBeenCalledWith(
      'エラー',
      REC_PERMISSION_MESSAGES.micPermissionDenied,
    );
    expect(mockOnAbort).toHaveBeenCalledTimes(1);
    expect(mockPrepareToRecordAsync).not.toHaveBeenCalled();
  });

  it('録音セッション初期化に失敗しても active 復帰後のリトライで録音が開始される', async () => {
    // 1 回目の初期化は失敗、リトライは成功
    mockPrepareToRecordAsync.mockRejectedValueOnce(
      new Error('session init failed'),
    );

    // フォアグラウンド復帰待ちを検証するため background から開始する
    (AppState as unknown as { currentState: string }).currentState =
      'background';
    const appStateSpy = jest.spyOn(AppState, 'addEventListener');

    const { getByText } = render(<RecRecordingSection {...mockProps} />);

    await flushAsync();
    await advanceTimers(5000);
    await flushAsync();

    // active になるまでリトライしない
    expect(mockPrepareToRecordAsync).toHaveBeenCalledTimes(1);

    // active への遷移でリトライされ、録音が開始される
    const changeListener = appStateSpy.mock.calls.find(
      ([event]) => event === 'change',
    )?.[1];
    expect(changeListener).toBeDefined();
    await act(async () => {
      changeListener?.('active');
    });

    expect(mockPrepareToRecordAsync).toHaveBeenCalledTimes(2);
    expect(mockStartAsync).toHaveBeenCalledTimes(1);

    // タイマーが起動している
    await advanceTimers(1000);
    getByText('00:01:00');
    expect(alertSpy).not.toHaveBeenCalled();

    appStateSpy.mockRestore();
  });

  it('active 復帰前にアンマウントされた場合はリトライしない', async () => {
    mockPrepareToRecordAsync.mockRejectedValueOnce(
      new Error('session init failed'),
    );

    (AppState as unknown as { currentState: string }).currentState =
      'background';
    const mockRemove = jest.fn();
    const appStateSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockReturnValue({ remove: mockRemove } as ReturnType<
        typeof AppState.addEventListener
      >);

    const { unmount } = render(<RecRecordingSection {...mockProps} />);

    await flushAsync();
    await advanceTimers(5000);
    await flushAsync();
    expect(mockPrepareToRecordAsync).toHaveBeenCalledTimes(1);

    // 復帰待ちの間にモーダルが閉じられる（アンマウント）
    unmount();

    // アンマウント時に AppState リスナーが解除される
    expect(mockRemove).toHaveBeenCalled();

    // その後 active になってもリトライされない
    const changeListener = appStateSpy.mock.calls.find(
      ([event]) => event === 'change',
    )?.[1];
    await act(async () => {
      changeListener?.('active');
    });

    expect(mockPrepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(alertSpy).not.toHaveBeenCalled();

    appStateSpy.mockRestore();
  });

  it('リトライも失敗した場合は Alert が表示され、onAbort が呼ばれる', async () => {
    mockPrepareToRecordAsync.mockRejectedValue(new Error('session init failed'));

    const { getByText } = render(<RecRecordingSection {...mockProps} />);

    await flushAsync();
    await advanceTimers(5000);
    await flushAsync();

    expect(mockPrepareToRecordAsync).toHaveBeenCalledTimes(2);
    expect(alertSpy).toHaveBeenCalledWith(
      'エラー',
      REC_PERMISSION_MESSAGES.recordingStartFailed,
    );
    expect(mockOnAbort).toHaveBeenCalledTimes(1);

    // タイマーは起動しない
    await advanceTimers(1000);
    getByText('00:00:00');
  });

  it('録音開始（startAsync）の一時失敗は active 復帰後のリトライで回復する', async () => {
    mockStartAsync.mockRejectedValueOnce(new Error('session inactive'));

    const { getByText } = render(
      <RecRecordingSection
        {...mockProps}
        trackSource="https://example.com/track.mp3"
      />,
    );

    await flushAsync();
    await advanceTimers(5000);
    await flushAsync();

    // active のためリトライは即時実行され、録音が開始される
    expect(mockStartAsync).toHaveBeenCalledTimes(2);
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockOnAbort).not.toHaveBeenCalled();

    await advanceTimers(1000);
    getByText('00:01:00');
  });

  it('startAsync 待ちの間にアンマウントされた場合は録音を破棄する', async () => {
    let resolveStart: () => void = () => {};
    mockStartAsync.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveStart = resolve;
      }),
    );

    const { unmount } = render(
      <RecRecordingSection
        {...mockProps}
        trackSource="https://example.com/track.mp3"
      />,
    );

    await flushAsync();
    await advanceTimers(5000);
    await flushAsync();
    expect(mockStartAsync).toHaveBeenCalledTimes(1);

    // startAsync が解決する前にモーダルが閉じられる
    unmount();
    await act(async () => {
      resolveStart();
    });

    // 録音・トラックとも破棄される（マイクを掴んだままにしない）
    expect(mockStopAndUnloadAsync).toHaveBeenCalled();
    expect(mockStopAsync).toHaveBeenCalled();
    expect(mockUnloadAsync).toHaveBeenCalled();
  });

  it('トラックのロード中に停止ボタンが押されたら録音を開始しない', async () => {
    let resolveCreate: (value: unknown) => void = () => {};
    mockCreateAsync.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );

    const { getByTestId } = render(
      <RecRecordingSection
        {...mockProps}
        trackSource="https://example.com/track.mp3"
      />,
    );

    await flushAsync();
    await advanceTimers(5000);
    await flushAsync();
    expect(mockCreateAsync).toHaveBeenCalledTimes(1);

    // トラックのロードが終わる前に停止ボタンを押す
    fireEvent.press(getByTestId('rec-recording-section-pressable'));
    await flushAsync();

    // ロード完了後も録音は開始されず、音源は破棄される
    await act(async () => {
      resolveCreate({
        sound: {
          stopAsync: mockStopAsync,
          unloadAsync: mockUnloadAsync,
          getStatusAsync: mockSoundGetStatusAsync,
        },
      });
    });

    expect(mockStartAsync).not.toHaveBeenCalled();
    expect(mockStopAndUnloadAsync).toHaveBeenCalled();
    expect(mockStopAsync).toHaveBeenCalled();
    expect(mockUnloadAsync).toHaveBeenCalled();
    // 保存できる録音がないためモーダルを閉じる
    expect(mockOnAbort).toHaveBeenCalledTimes(1);
    expect(mockOnStop).not.toHaveBeenCalled();
  });

  it('トラック音源の再生に失敗した場合は Alert を表示して録音を中止する', async () => {
    // 無音のまま録音を続けると選択位置と実態がズレたテイクが保存されるため、
    // 継続せず中止する（TASK-44）
    mockCreateAsync.mockRejectedValue(new Error('track load failed'));

    const { getByText } = render(
      <RecRecordingSection
        {...mockProps}
        trackSource="https://example.com/track.mp3"
      />,
    );

    await flushAsync();
    await advanceTimers(5000);
    await flushAsync();

    // 録音は開始されず、準備済みの Recording は破棄される
    expect(mockStartAsync).not.toHaveBeenCalled();
    expect(mockStopAndUnloadAsync).toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith(
      'エラー',
      REC_PERMISSION_MESSAGES.trackPlaybackFailed,
    );
    expect(mockOnAbort).toHaveBeenCalledTimes(1);

    // タイマーは起動しない
    await advanceTimers(1000);
    getByText('00:00:00');
  });

  it('trackSource なし（QuickRecord）の場合は実測なしで録音が開始される', async () => {
    const { getByText, getByTestId } = render(
      <RecRecordingSection {...mockProps} trackSource={null} />,
    );

    await flushAsync();
    await advanceTimers(5000);
    await flushAsync();

    expect(mockCreateAsync).not.toHaveBeenCalled();
    expect(mockStartAsync).toHaveBeenCalledTimes(1);

    await advanceTimers(1000);
    getByText('00:01:00');

    fireEvent.press(getByTestId('rec-recording-section-pressable'));
    await flushAsync();
    expect(mockOnStop).toHaveBeenCalledWith(
      expect.any(Number),
      'mock-recording-uri',
      undefined,
    );
  });
});
