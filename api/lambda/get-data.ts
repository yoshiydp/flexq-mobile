import { loadMockData, createResponse } from './utils';

export const handler = async () => {
  return createResponse({
    memo: loadMockData('memoData'),
    profile: loadMockData('profileData'),
    project: loadMockData('projectData'),
    record: loadMockData('recordData'),
    track: loadMockData('trackData'),
  });
};
