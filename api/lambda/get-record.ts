// api/lambda/get-record.ts
import { loadMockData, createResponse } from './utils';

export const handler = async () => {
  return createResponse(loadMockData('RECORD_DATA'));
};
