import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import path from 'path';
import fs from 'fs';
import { AUTH_DATA } from '../src/data/authData';

const app = express();
app.use(cors());
app.use(express.json());

// In-memory user store for mock registration/reset (seeded from AUTH_DATA)
const mockUsers: Array<{ email: string; password: string; username: string; thumbnail: string | null }> =
  AUTH_DATA.map((u) => ({ email: u.email, password: u.password, username: u.username, thumbnail: u.thumbnail ?? null }));

// POST /data/auth/register
app.post('/data/auth/register', (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ message: 'Username, email, and password are required' });
  }
  if (mockUsers.find((u) => u.email === email)) {
    return res.status(409).json({ message: 'Email already in use' });
  }
  mockUsers.push({ email, password, username, thumbnail: null });
  return res.status(201).json({
    userId: `user_${Date.now()}`,
    username,
    email,
    thumbnail: null,
    socialAccounts: [],
    token: {
      accessToken: 'mock_access_token_new_user',
      refreshToken: 'mock_refresh_token_new_user',
      expiresIn: 604800,
    },
  });
});
console.log('Mock endpoint ready: POST /data/auth/register');

// POST /data/auth/google（Google ログインのモック。トークン検証は行わない）
app.post('/data/auth/google', (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken) {
    return res.status(400).json({ message: 'Google access token is required' });
  }
  const baseUser = AUTH_DATA[0];
  const { password: _, ...safeBase } = baseUser as any;
  return res.json(safeBase);
});
console.log('Mock endpoint ready: POST /data/auth/google');

// POST /data/profile/link-google（Google アカウント連携のモック。トークン検証は行わない）
app.post('/data/profile/link-google', (req, res) => {
  const { accessToken } = req.body;
  if (!accessToken) {
    return res.status(400).json({ message: 'Google access token is required' });
  }
  return res.json({ linked: true, name: 'Mock Google User' });
});
console.log('Mock endpoint ready: POST /data/profile/link-google');

// POST /data/auth/reset-password
app.post('/data/auth/reset-password', (req, res) => {
  const { email, newPassword } = req.body;
  if (!email || !newPassword) {
    return res.status(400).json({ message: 'Email and new password are required' });
  }
  const user = mockUsers.find((u) => u.email === email);
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  user.password = newPassword;
  return res.json({ message: 'Password reset successfully' });
});
console.log('Mock endpoint ready: POST /data/auth/reset-password');

// POST /data/auth/refresh
app.post('/data/auth/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ message: 'Refresh token is required' });
  }
  return res.json({
    token: {
      accessToken: `mock_access_token_refreshed_${Date.now()}`,
      refreshToken: `mock_refresh_token_refreshed_${Date.now()}`,
      expiresIn: 604800,
    },
  });
});
console.log('Mock endpoint ready: POST /data/auth/refresh');

app.use(
  '/audio',
  express.static(path.resolve(__dirname, '../src/assets/audio')),
);
app.use(
  '/images',
  express.static(path.resolve(__dirname, '../src/assets/images')),
);
app.use(
  '/record',
  express.static(path.resolve(__dirname, '../src/assets/record')),
);

const openapiPath = path.resolve(__dirname, '../api/openapi.yaml');
if (!fs.existsSync(openapiPath)) {
  console.error(
    'openapi.yaml が見つかりません。先に yarn generate:openapi を実行してください。',
  );
  process.exit(1);
}

const swaggerDocument = YAML.load(openapiPath);

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

swaggerDocument.paths &&
  Object.keys(swaggerDocument.paths).forEach((route) => {
    const pathItem = swaggerDocument.paths[route];
    const getRoute = pathItem.get;
    const postRoute = pathItem.post;

    if (getRoute?.responses?.['200']?.content?.['application/json']?.examples) {
      const exampleKey = Object.keys(
        getRoute.responses['200'].content['application/json'].examples,
      )[0];
      const example =
        swaggerDocument.components.examples[exampleKey]?.value || {};
      const expressRoute = route.replace('{id}', ':id');

      app.get(expressRoute, (req, res) => {
        res.json(example);
      });

      console.log(`Mock endpoint ready: GET ${expressRoute}`);
    }

    if (
      postRoute?.responses?.['200']?.content?.['application/json']?.examples
    ) {
      const exampleKey = Object.keys(
        postRoute.responses['200'].content['application/json'].examples,
      )[0];
      const example =
        swaggerDocument.components.examples[exampleKey]?.value || {};
      const expressRoute = route.replace('{id}', ':id');

      app.post(expressRoute, (req, res) => {
        if (expressRoute === '/data/auth/login') {
          const { email, password } = req.body;
          // mockUsers を参照することでパスワードリセット・新規登録を反映
          const mockUser = mockUsers.find(
            (u) => u.email === email && u.password === password,
          );
          if (!mockUser) {
            return res.status(401).json({ message: 'Invalid credentials' });
          }
          // AUTH_DATA からトークン等の残りの情報を取得
          const baseUser = Array.isArray(example)
            ? example.find((u: any) => u.email === email) ?? example[0]
            : example;
          const { password: _, ...safeBase } = baseUser as any;
          return res.json({
            ...safeBase,
            username: mockUser.username,
            email: mockUser.email,
            thumbnail: mockUser.thumbnail,
          });
        }

        if (expressRoute === '/data/auth/logout') {
          return res.json({ message: 'Logged out successfully' });
        }

        res.json(example);
      });

      console.log(`Mock endpoint ready: POST ${expressRoute}`);
    }
  });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(
    `🚀 Swagger Mock Server running at http://localhost:${PORT}/api-docs`,
  );
});
