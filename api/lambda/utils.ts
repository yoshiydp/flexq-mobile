import path from 'path';

const MOCK_DIR = path.resolve(__dirname, 'mock');

export function loadMockData(fileBaseName: string) {
  try {
    const mod = require(path.join(MOCK_DIR, `${fileBaseName}.js`));
    return mod.default ?? mod;
  } catch (e) {
    console.error('Mock load error:', e);
    return { error: 'Mock data not found', fileBaseName };
  }
}

export function createResponse(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}
