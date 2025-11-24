// api/lambda/get-profile.ts
import { loadMockData, createResponse } from './utils';

export const handler = async () => {
  return createResponse(loadMockData('PROFILE_DATA'));
};
