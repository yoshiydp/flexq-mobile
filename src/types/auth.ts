/**
 * Authentication / User Profile Types
 * -----------------------------------
 * Used for mock data (AUTH_DATA) and future Cognito integration.
 */

export interface SocialAccount {
  provider: 'x' | 'instagram' | 'google' | string;
  username: string;
  isLinked: boolean;
}

export interface AuthToken {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

/**
 * Represents a single user entry in AUTH_DATA.
 * (Local mock + Cognito integration-ready)
 */
export interface AuthUser {
  id: string;
  email: string;
  password?: string; // mock only (to be removed in Cognito)
  username: string;
  thumbnail?: string;
  socialAccounts: SocialAccount[];
  token: AuthToken;
}
