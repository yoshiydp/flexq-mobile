// api/lambda/post-auth-logout.ts
import { createResponse } from './utils';

export const handler = async () => {
  return createResponse({ message: 'Logged out successfully' });
};
