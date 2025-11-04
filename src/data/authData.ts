export const AUTH_DATA = [
  {
    id: 'user_001',
    email: 'testuser@example.com',
    password: 'password123',
    username: 'User Profile Name',
    thumbnail: 'http://localhost:3000/images/sample/profile.jpg',
    socialAccounts: [
      { provider: 'x', username: '@user_name', isLinked: true },
      { provider: 'instagram', username: '@user_name', isLinked: true },
      { provider: 'google', username: 'Yoshi Watanabe', isLinked: true },
    ],
    token: {
      accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.mock_access_token',
      refreshToken: 'mock_refresh_token_value',
      expiresIn: 3600,
    },
  },
];
