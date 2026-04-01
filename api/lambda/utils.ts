import { PROJECT_DATA } from '../../src/data/projectData';
import { MEMO_DATA } from '../../src/data/memoData';
import { PROFILE_DATA } from '../../src/data/profileData';
import { RECORD_DATA } from '../../src/data/recordData';
import { TRACK_DATA } from '../../src/data/trackData';
import { PROJECT_RECORD_LIST_DATA } from '../../src/data/projectRecordListData';

const MOCK_DATA: Record<string, unknown> = {
  projectData: PROJECT_DATA,
  memoData: MEMO_DATA,
  profileData: PROFILE_DATA,
  recordData: RECORD_DATA,
  trackData: TRACK_DATA,
  projectRecordListData: PROJECT_RECORD_LIST_DATA,
};

export function loadMockData(fileBaseName: string) {
  const data = MOCK_DATA[fileBaseName];
  if (data === undefined) {
    console.error('Mock data not found:', fileBaseName);
    return { error: 'Mock data not found', fileBaseName };
  }
  return data;
}

export function createResponse(body: unknown, statusCode = 200) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
    body: JSON.stringify(body),
  };
}
