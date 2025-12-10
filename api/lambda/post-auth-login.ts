import { createResponse } from './utils';

export const handler = async () => {
  return createResponse({
    token: 'mock-token',
    userId: 'user_001',
  });
};
