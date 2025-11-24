// api/lambda/get-data.ts
import { loadMockData, createResponse } from './utils';

export const handler = async () => {
  const keys = [
    'AUTH_DATA',
    'MEMO_DATA',
    'PROFILE_DATA',
    'PROJECT_DATA',
    'PROJECT_DATA_DETAIL',
    'PROJECT_RECORD_LIST_DATA',
    'RECORD_DATA',
    'TRACK_DATA',
  ];

  const result: Record<string, any> = {};
  keys.forEach((k) => (result[k] = loadMockData(k)));
  return createResponse(result);
};
