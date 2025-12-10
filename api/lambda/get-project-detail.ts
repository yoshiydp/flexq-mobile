import { loadMockData, createResponse } from './utils';

export const handler = async (event: any) => {
  const id = event.pathParameters?.id;
  const data = loadMockData('projectData');
  return createResponse(data.find((p: any) => p.id === id));
};
