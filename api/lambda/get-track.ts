// api/lambda/get-track.ts
import { loadMockData, createResponse } from './utils';

export const handler = async () => {
  return createResponse(loadMockData('TRACK_DATA'));
};
