import { renderHook, act } from '@testing-library/react-native';
import { Alert, Platform } from 'react-native';
import { useLinkAppleAccount } from './useLinkAppleAccount';

const mockSignIn = jest.fn();
let mockAvailable = true;
const mockShowLoading = jest.fn();
const mockHideLoading = jest.fn();
const mockLinkApple = jest.fn();

jest.mock('@/hooks/useAppleAuth', () => ({
  useAppleAuth: () => ({ signIn: mockSignIn, available: mockAvailable }),
}));

jest.mock('@/contexts/ModalContext', () => ({
  useModal: () => ({ showLoading: mockShowLoading, hideLoading: mockHideLoading }),
}));

jest.mock('@/apiClient/services/DefaultService', () => ({
  DefaultService: {
    postDataProfileLinkApple: (...args: unknown[]) => mockLinkApple(...args),
  },
}));

const credential = {
  identityToken: 'identity-token',
  authorizationCode: 'auth-code',
  rawNonce: 'raw-nonce',
  fullName: null,
};

const runLink = async () => {
  const { result } = renderHook(() => useLinkAppleAccount());
  let username: string | null = null;
  await act(async () => {
    username = await result.current.linkApple();
  });
  return username;
};

describe('useLinkAppleAccount', () => {
  const originalOS = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAvailable = true;
    mockSignIn.mockResolvedValue(credential);
    mockLinkApple.mockResolvedValue({ linked: true, email: 'abc@privaterelay.appleid.com' });
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    Platform.OS = originalOS;
  });

  it('identityToken・nonce・認可コードを連携 API に送り、表示名（Apple ID のメール）を返す', async () => {
    await expect(runLink()).resolves.toBe('abc@privaterelay.appleid.com');

    expect(mockLinkApple).toHaveBeenCalledWith({
      identityToken: 'identity-token',
      authorizationCode: 'auth-code',
      rawNonce: 'raw-nonce',
    });
    expect(mockShowLoading).toHaveBeenCalledTimes(1);
    expect(mockHideLoading).toHaveBeenCalledTimes(1);
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('メールが返らない場合は「Apple ID」を表示名にする', async () => {
    mockLinkApple.mockResolvedValue({ linked: true, email: '' });
    await expect(runLink()).resolves.toBe('Apple ID');
  });

  it('キャンセルしたら API を呼ばず、無通知で null を返す', async () => {
    mockSignIn.mockResolvedValue(null);

    await expect(runLink()).resolves.toBeNull();

    expect(mockLinkApple).not.toHaveBeenCalled();
    expect(mockShowLoading).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('別アカウントに連携済み（409）なら専用の案内を出して null を返す', async () => {
    mockLinkApple.mockRejectedValue({ status: 409 });

    await expect(runLink()).resolves.toBeNull();

    expect(Alert.alert).toHaveBeenCalledWith(
      'エラー',
      'この Apple ID はすでに別の FlexQ アカウントに連携されています。',
    );
    expect(mockHideLoading).toHaveBeenCalledTimes(1);
  });

  it('その他の失敗は汎用の案内を出して null を返す', async () => {
    mockSignIn.mockRejectedValue({ code: 'ERR_REQUEST_FAILED' });

    await expect(runLink()).resolves.toBeNull();

    expect(Alert.alert).toHaveBeenCalledWith('エラー', 'Apple ID の連携に失敗しました。');
    // ローディングを出す前の失敗では hideLoading を呼ばない（重ね掛けの数を崩さない）
    expect(mockHideLoading).not.toHaveBeenCalled();
  });

  it('Android では認証シートを開かず、iPhone から連携するよう案内する', async () => {
    Platform.OS = 'android';
    mockAvailable = false;

    await expect(runLink()).resolves.toBeNull();

    expect(mockSignIn).not.toHaveBeenCalled();
    expect(Alert.alert).toHaveBeenCalledWith(
      'Apple ID の連携',
      'Apple ID の連携は iPhone のアプリから行えます。',
    );
  });
});
