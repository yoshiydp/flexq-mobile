import { createResponse } from './utils';

export const handler = async () => {
  return createResponse({
    token: {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
    },
    userId: 'user_001',
  });
};
