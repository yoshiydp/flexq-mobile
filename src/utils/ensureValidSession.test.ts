import { ensureValidSession } from './ensureValidSession';
import { getAccessToken } from '@/utils/authStorage';
import { refreshAccessToken } from '@/utils/authTokenInterceptor';
import { isJwtExpired } from '@/utils/jwt';

jest.mock('@/utils/authStorage', () => ({
  getAccessToken: jest.fn(),
}));

jest.mock('@/utils/authTokenInterceptor', () => ({
  refreshAccessToken: jest.fn(),
}));

jest.mock('@/utils/jwt', () => ({
  isJwtExpired: jest.fn(),
}));

const mockGetAccessToken = getAccessToken as jest.Mock;
const mockRefreshAccessToken = refreshAccessToken as jest.Mock;
const mockIsJwtExpired = isJwtExpired as jest.Mock;

describe('ensureValidSession', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('アクセストークンが無い場合は false を返し、リフレッシュしないこと', async () => {
    mockGetAccessToken.mockResolvedValue(null);

    await expect(ensureValidSession()).resolves.toBe(false);
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });

  it('トークンが有効な場合は true を返し、リフレッシュしないこと', async () => {
    mockGetAccessToken.mockResolvedValue('valid-token');
    mockIsJwtExpired.mockReturnValue(false);

    await expect(ensureValidSession()).resolves.toBe(true);
    expect(mockIsJwtExpired).toHaveBeenCalledWith('valid-token');
    expect(mockRefreshAccessToken).not.toHaveBeenCalled();
  });

  it('トークン失効時はリフレッシュを試み、成功したら true を返すこと', async () => {
    mockGetAccessToken.mockResolvedValue('expired-token');
    mockIsJwtExpired.mockReturnValue(true);
    mockRefreshAccessToken.mockResolvedValue('new-access-token');

    await expect(ensureValidSession()).resolves.toBe(true);
    expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
  });

  it('リフレッシュに失敗した場合は false を返すこと', async () => {
    mockGetAccessToken.mockResolvedValue('expired-token');
    mockIsJwtExpired.mockReturnValue(true);
    mockRefreshAccessToken.mockResolvedValue(null);

    await expect(ensureValidSession()).resolves.toBe(false);
  });
});
