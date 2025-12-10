import { loadMockData, createResponse } from './utils';

export const handler = async () => {
  const data = loadMockData('memoData');
  return createResponse(data);
};
