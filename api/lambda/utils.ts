// api/lambda/utils.ts
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(__dirname, '../../src/data');

export function loadMockData(key: string) {
  try {
    const filePath = path.join(DATA_DIR, `${key}.ts`);
    const mod = require(filePath);
    return mod[key];
  } catch (err) {
    return { error: 'Data not found', key };
  }
}

export function createResponse(body: any, statusCode = 200) {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
