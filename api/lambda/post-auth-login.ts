// api/lambda/post-auth-login.ts
import { loadMockData, createResponse } from './utils';

export const handler = async (event: any) => {
  const { email, password } = JSON.parse(event.body || '{}');
  const auth = loadMockData('AUTH_DATA');

  if (email === auth.email && password === 'password123') {
    return createResponse(auth);
  }
  return createResponse({ message: 'Invalid credentials' }, 401);
};
