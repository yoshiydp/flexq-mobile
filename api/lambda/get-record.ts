import { loadMockData, createResponse } from './utils';

export const handler = async () => {
  const data = loadMockData('recordData');
  return createResponse(data);
};
