// api/lambda/get-project-detail.ts
import { loadMockData, createResponse } from './utils';

export const handler = async (event: any) => {
  const { id } = event.pathParameters || {};
  const data = loadMockData('PROJECT_DATA_DETAIL');

  if (data?.id === id) {
    return createResponse(data);
  }
  return createResponse({ message: 'Not found' }, 404);
};
