/**
 * useGoogleAuth の Android クライアント ID（TASK-54）のユニットテスト
 * - EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID 設定時は androidClientId として useAuthRequest に渡される
 * - 未設定時もレンダーを壊さない（undefined だと Google.useAuthRequest の
 *   invariantClientId がレンダー時に throw するため、プレースホルダーを渡す）
 * - Android で未設定のまま signIn した場合は明示的なエラーを throw して
 *   呼び出し側の catch（エラーアラート）につなげる
 * - iOS は環境変数未設定でも従来どおり動作する
 */
import { renderHook } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { useGoogleAuth } from './useGoogleAuth';

const mockPromptAsync = jest.fn();
// useAuthRequest に渡された config を検証用に捕捉する
let mockLastAuthConfig: Record<string, unknown> | undefined;

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
}));

jest.mock('expo-auth-session', () => ({
  makeRedirectUri: jest.fn(() => 'com.yoshiydp.lyricsapp://'),
}));

jest.mock('expo-auth-session/providers/google', () => ({
  useAuthRequest: (config: Record<string, unknown>) => {
    mockLastAuthConfig = config;
    return [{}, null, mockPromptAsync];
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { executionEnvironment: 'standalone' },
  ExecutionEnvironment: {
    Bare: 'bare',
    Standalone: 'standalone',
    StoreClient: 'storeClient',
  },
}));

const TEST_CLIENT_ID = 'test-android-id.apps.googleusercontent.com';

describe('useGoogleAuth の androidClientId（TASK-54）', () => {
  const originalEnv = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockLastAuthConfig = undefined;
    delete process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
  });

  afterEach(() => {
    Platform.OS = originalOS;
    if (originalEnv === undefined) {
      delete process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;
    } else {
      process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = originalEnv;
    }
  });

  it('環境変数設定時は androidClientId として useAuthRequest に渡される', () => {
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = TEST_CLIENT_ID;

    renderHook(() => useGoogleAuth());

    expect(mockLastAuthConfig?.androidClientId).toBe(TEST_CLIENT_ID);
  });

  it('環境変数未設定でも androidClientId は undefined にしない（レンダー時 throw の回避）', () => {
    renderHook(() => useGoogleAuth());

    expect(typeof mockLastAuthConfig?.androidClientId).toBe('string');
    expect(mockLastAuthConfig?.androidClientId).toBeTruthy();
    // iOS クライアント ID は従来どおり渡される
    expect(mockLastAuthConfig?.iosClientId).toMatch(
      /\.apps\.googleusercontent\.com$/,
    );
  });

  it('Android で環境変数未設定のまま signIn すると明示的なエラーを throw する', async () => {
    Platform.OS = 'android';
    const { result } = renderHook(() => useGoogleAuth());

    await expect(result.current.signIn()).rejects.toThrow(
      'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
    );
    expect(mockPromptAsync).not.toHaveBeenCalled();
  });

  it('Android で環境変数設定時は promptAsync まで進む', async () => {
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID = TEST_CLIENT_ID;
    Platform.OS = 'android';
    mockPromptAsync.mockResolvedValue({ type: 'dismiss' });
    const { result } = renderHook(() => useGoogleAuth());

    await expect(result.current.signIn()).resolves.toBeNull();
    expect(mockPromptAsync).toHaveBeenCalled();
  });

  it('iOS は環境変数未設定でも従来どおり promptAsync が呼ばれる', async () => {
    Platform.OS = 'ios';
    mockPromptAsync.mockResolvedValue({ type: 'dismiss' });
    const { result } = renderHook(() => useGoogleAuth());

    await expect(result.current.signIn()).resolves.toBeNull();
    expect(mockPromptAsync).toHaveBeenCalled();
  });
});
