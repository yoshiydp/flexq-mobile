import { loadMockData, createResponse } from './utils';

export const handler = async () => {
  return createResponse(loadMockData('projectData'));
};
