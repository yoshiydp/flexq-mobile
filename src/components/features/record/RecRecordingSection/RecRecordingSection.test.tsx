import React from 'react';
import { Alert, AppState } from 'react-native';
import { render, act } from '@testing-library/react-native';
import RecRecordingSection from './index';
import { REC_PERMISSION_MESSAGES } from '@/constants/messages';

const mockRequestPermissionsAsync = jest.fn();
const mockSetAudioModeAsync = jest.fn();
const mockPrepareToRecordAsync = jest.fn();
const mockStartAsync = jest.fn();
const mockStopAndUnloadAsync = jest.fn();
const mockCreateAsync = jest.fn();
const mockStopAsync = jest.fn();
const mockUnloadAsync = jest.fn();

jest.mock('expo-av', () => {
  return {
    Audio: {
      requestPermissionsAsync: (...args: unknown[]) =>
        mockRequestPermissionsAsync(...args),
      setAudioModeAsync: (...args: unknown[]) => mockSetAudioModeAsync(...args),
      Recording: jest.fn().mockImplementation(() => ({
        prepareToRecordAsync: mockPrepareToRecordAsync,
        startAsync: mockStartAsync,
        stopAndUnloadAsync: mockStopAndUnloadAsync,
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
      },
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
    });
    expect(mockPrepareToRecordAsync).toHaveBeenCalledTimes(1);
    expect(mockStartAsync).toHaveBeenCalledTimes(1);

    // トラック音源が指定位置から再生される
    expect(mockCreateAsync).toHaveBeenCalledWith(
      { uri: 'https://example.com/track.mp3' },
      { shouldPlay: true, positionMillis: 2000, volume: 1.0 },
    );

    // タイマーが起動している
    await advanceTimers(1000);
    getByText('00:01:00');
    expect(alertSpy).not.toHaveBeenCalled();
    expect(mockOnAbort).not.toHaveBeenCalled();
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

  it('トラック音源の再生に失敗しても録音とタイマーは継続する', async () => {
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

    expect(mockStartAsync).toHaveBeenCalledTimes(1);

    // タイマーが起動している
    await advanceTimers(1000);
    getByText('00:01:00');
    expect(mockOnAbort).not.toHaveBeenCalled();
  });
});
