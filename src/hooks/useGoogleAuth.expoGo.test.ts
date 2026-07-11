/**
 * useGoogleAuth の Expo Go 判定のユニットテスト
 * executionEnvironment が storeClient（Expo Go）のとき、実 OAuth を呼ばず
 * モックユーザーを返すことを検証する。
 * （appOwnership は SDK 52 で非推奨となり Expo Go でも 'expo' を返さないため、
 * executionEnvironment ベースの判定に修正した際のリグレッション防止）
 */
import { renderHook } from '@testing-library/react-native';
import { useGoogleAuth } from './useGoogleAuth';

const mockPromptAsync = jest.fn();

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'com.yoshiydp.lyricsapp://'),
}));

jest.mock('expo-auth-session/providers/google', () => ({
  // Expo Go では request が生成できないケースを想定して null にする
  useAuthRequest: () => [null, null, mockPromptAsync],
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'storeClient' },
  ExecutionEnvironment: {
    Bare: 'bare',
    Standalone: 'standalone',
    StoreClient: 'storeClient',
  },
}));

describe('useGoogleAuth（Expo Go）', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('Expo Go ではモックユーザーを返し、実 OAuth を呼ばない', async () => {
    const { result } = renderHook(() => useGoogleAuth());

    const user = await result.current.signIn();

    expect(user?.email).toBe('mock@example.com');
    expect(user?.name).toBe('Mock User (Expo Go)');
    expect(mockPromptAsync).not.toHaveBeenCalled();
  });

  it('Expo Go では request が無くても ready が true になる', () => {
    const { result } = renderHook(() => useGoogleAuth());

    expect(result.current.ready).toBe(true);
  });
});
