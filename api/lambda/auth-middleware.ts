import * as jwt from 'jsonwebtoken';

export interface TokenPayload {
  userId: string;
  email: string;
  type?: string;
}

export function verifyToken(event: any): TokenPayload | null {
  const authHeader =
    event.headers?.Authorization || event.headers?.authorization;
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as TokenPayload;
    // refreshToken（type: 'refresh'）は保護 API のアクセストークンとして使えない
    if (payload.type === 'refresh') return null;
    return payload;
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
