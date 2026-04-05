import * as jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  email: string;
}

export function verifyToken(event: any): TokenPayload | null {
  const authHeader =
    event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  try {
    return jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
  } catch {
    return null;
  }
}

export function unauthorizedResponse() {
  return {
    statusCode: 401,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify({ message: 'Unauthorized' }),
  };
}
