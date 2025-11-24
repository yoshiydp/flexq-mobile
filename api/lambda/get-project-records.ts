// api/lambda/get-project-records.ts
import { loadMockData, createResponse } from './utils';

export const handler = async (event: any) => {
  const { id } = event.pathParameters || {};
  const list = loadMockData('PROJECT_RECORD_LIST_DATA');

  const result = list?.find((p: any) => p.projectId === id);
  return createResponse(result ?? { message: 'Not found' });
};
