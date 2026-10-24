import { renderHook, act, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAppleAuth } from './useAppleAuth';

jest.mock('expo-apple-authentication', () => ({
  isAvailableAsync: jest.fn(async () => true),
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
}));

jest.mock('expo-crypto', () => ({
  randomUUID: jest.fn(() => 'raw-nonce'),
  digestStringAsync: jest.fn(async (_algorithm: string, value: string) => `sha256(${value})`),
  CryptoDigestAlgorithm: { SHA256: 'SHA-256' },
}));

const mockSignInAsync = AppleAuthentication.signInAsync as jest.Mock;
const mockIsAvailableAsync = AppleAuthentication.isAvailableAsync as jest.Mock;

describe('useAppleAuth', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAvailableAsync.mockResolvedValue(true);
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('iOS で利用可能なら available が true になる', async () => {
    Platform.OS = 'ios';
    const { result } = renderHook(() => useAppleAuth());
    await waitFor(() => expect(result.current.available).toBe(true));
  });

  it('Android では提供しない（isAvailableAsync も呼ばない）', async () => {
    Platform.OS = 'android';
    const { result } = renderHook(() => useAppleAuth());
    await act(async () => {});
    expect(result.current.available).toBe(false);
    expect(mockIsAvailableAsync).not.toHaveBeenCalled();
  });

  it('nonce の SHA-256 を Apple に渡し、生の nonce を結果で返す', async () => {
    Platform.OS = 'ios';
    mockSignInAsync.mockResolvedValue({
      identityToken: 'identity-token',
      authorizationCode: 'auth-code',
      fullName: { givenName: 'Taro', familyName: 'Yamada' },
    });
    const { result } = renderHook(() => useAppleAuth());

    let credential;
    await act(async () => {
      credential = await result.current.signIn();
    });

    expect(mockSignInAsync).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 'sha256(raw-nonce)' }),
    );
    expect(credential).toEqual({
      identityToken: 'identity-token',
      authorizationCode: 'auth-code',
      rawNonce: 'raw-nonce',
      fullName: { givenName: 'Taro', familyName: 'Yamada' },
    });
  });

  it('2 回目以降で氏名が返らない場合は fullName を null にする', async () => {
    Platform.OS = 'ios';
    mockSignInAsync.mockResolvedValue({
      identityToken: 'identity-token',
      authorizationCode: 'auth-code',
      fullName: { givenName: null, familyName: null },
    });
    const { result } = renderHook(() => useAppleAuth());

    let credential: any;
    await act(async () => {
      credential = await result.current.signIn();
    });

    expect(credential.fullName).toBeNull();
  });

  it('ユーザーがキャンセルしたら null を返す（エラーにしない）', async () => {
    Platform.OS = 'ios';
    mockSignInAsync.mockRejectedValue({ code: 'ERR_REQUEST_CANCELED' });
    const { result } = renderHook(() => useAppleAuth());

    let credential;
    await act(async () => {
      credential = await result.current.signIn();
    });

    expect(credential).toBeNull();
  });

  it('キャンセル以外の失敗は throw する', async () => {
    Platform.OS = 'ios';
    mockSignInAsync.mockRejectedValue(new Error('failed'));
    const { result } = renderHook(() => useAppleAuth());

    await expect(result.current.signIn()).rejects.toThrow('failed');
  });

  it('identityToken が返らなければ throw する', async () => {
    Platform.OS = 'ios';
    mockSignInAsync.mockResolvedValue({
      identityToken: null,
      authorizationCode: 'auth-code',
      fullName: null,
    });
    const { result } = renderHook(() => useAppleAuth());

    await expect(result.current.signIn()).rejects.toThrow('no identity token');
  });
});
