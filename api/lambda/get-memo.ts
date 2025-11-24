// api/lambda/get-memo.ts
import { loadMockData, createResponse } from './utils';

export const handler = async () => {
  return createResponse(loadMockData('MEMO_DATA'));
};
