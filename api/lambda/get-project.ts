// api/lambda/get-project.ts
import { loadMockData, createResponse } from './utils';

export const handler = async () => {
  const data = loadMockData('PROJECT_DATA');
  return createResponse(data);
};
