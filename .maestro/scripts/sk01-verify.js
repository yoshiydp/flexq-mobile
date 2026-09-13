// SK-01 / SK-02 用 API 検証（dev API を直接呼び出す）
//
// TASK-102 の S3 キー所有者検証を API レベルで確認する。UI からは自ユーザーの
// プレフィックス配下のキーしか送られないため、拒否ケースは runScript でしか再現できない。
//   SK-01: 他ユーザーのプレフィックス・パストラバーサルを含むキーを各登録系 API に送ると 400 になる
//   SK-02: 存在しない trackId でプロジェクトを作成しても、トラック一覧に title も s3Key もない
//          壊れた項目が作られない（linkedProjects の list_append が attribute_exists 条件付きになった）
//
// フロー側の env で API_BASE_URL / E2E_EMAIL / E2E_PASSWORD を渡すこと。
// 作成したプロジェクト（e2e-SK02 プレフィックス）はスクリプト内で削除して後始末する。

const headersJson = { 'Content-Type': 'application/json' };

const loginRes = http.post(API_BASE_URL + '/data/auth/login', {
  headers: headersJson,
  body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
});
if (!loginRes.ok) {
  throw new Error('SK setup: login failed (' + loginRes.status + '): ' + loginRes.body);
}
const login = json(loginRes.body);
const ownUserId = login.userId;
const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + login.token.accessToken,
};

// 実在しない別ユーザーの ID（他ユーザーのプレフィックスを模倣する）
const OTHER_USER = 'e2e-other-user-00000000-0000-0000-0000-000000000000';

function expectRejected(label, res) {
  if (res.status !== 400) {
    throw new Error(
      label + ': expected 400 but got ' + res.status + ': ' + res.body,
    );
  }
  const message = json(res.body).message || '';
  if (message.indexOf('Invalid') !== 0) {
    throw new Error(label + ': expected "Invalid ..." message but got: ' + res.body);
  }
}

// ---------------------------------------------------------------------------
// SK-01: 他ユーザーのキー・パストラバーサルの拒否
// ---------------------------------------------------------------------------
const rejectCases = [
  {
    label: 'post-track s3Key (other user)',
    method: 'post',
    path: '/data/track',
    body: { title: 'e2e-SK01', s3Key: 'tracks/' + OTHER_USER + '/x.mp3', extention: 'mp3' },
  },
  {
    label: 'post-track s3Key (path traversal)',
    method: 'post',
    path: '/data/track',
    body: {
      title: 'e2e-SK01',
      s3Key: 'tracks/' + ownUserId + '/../' + OTHER_USER + '/x.mp3',
      extention: 'mp3',
    },
  },
  {
    label: 'post-track artworkKey (other user)',
    method: 'post',
    path: '/data/track',
    body: {
      title: 'e2e-SK01',
      s3Key: 'tracks/' + ownUserId + '/e2e-sk01.mp3',
      extention: 'mp3',
      artworkKey: 'artworks/' + OTHER_USER + '/x.jpg',
    },
  },
  {
    label: 'post-record s3Key (other user)',
    method: 'post',
    path: '/data/record',
    body: { title: 'e2e-SK01', s3Key: 'records/' + OTHER_USER + '/x.m4a' },
  },
  {
    label: 'post-record s3Key (wrong category)',
    method: 'post',
    path: '/data/record',
    body: { title: 'e2e-SK01', s3Key: 'tracks/' + ownUserId + '/x.m4a' },
  },
  {
    label: 'post-project artworkKey (other user)',
    method: 'post',
    path: '/data/project',
    body: { projectName: 'e2e-SK01', artworkKey: 'artworks/' + OTHER_USER + '/x.jpg' },
  },
  {
    label: 'post-project waveformJsonKey (other user)',
    method: 'post',
    path: '/data/project',
    body: { projectName: 'e2e-SK01', waveformJsonKey: 'waveforms/' + OTHER_USER + '/x.json' },
  },
  {
    label: 'put-profile thumbnailKey (other user)',
    method: 'put',
    path: '/data/profile',
    body: { thumbnailKey: 'artworks/' + OTHER_USER + '/x.jpg' },
  },
];

for (let i = 0; i < rejectCases.length; i++) {
  const c = rejectCases[i];
  const res =
    c.method === 'put'
      ? http.put(API_BASE_URL + c.path, { headers: authHeaders, body: JSON.stringify(c.body) })
      : http.post(API_BASE_URL + c.path, { headers: authHeaders, body: JSON.stringify(c.body) });
  expectRejected(c.label, res);
}

// ---------------------------------------------------------------------------
// SK-02: 存在しない trackId でプロジェクトを作成しても壊れたトラック行が作られない
// ---------------------------------------------------------------------------
const MISSING_TRACK_ID = 'e2e-sk02-missing-track';

// 前回の残骸掃除（e2e-SK02 プレフィックスのプロジェクトを削除）
const listRes = http.get(API_BASE_URL + '/data/project', { headers: authHeaders });
if (listRes.ok) {
  const projects = json(listRes.body);
  for (let i = 0; i < projects.length; i++) {
    if (projects[i].projectName && projects[i].projectName.indexOf('e2e-SK02') === 0) {
      http.delete(API_BASE_URL + '/data/project/' + projects[i].id, { headers: authHeaders });
    }
  }
}

const projectRes = http.post(API_BASE_URL + '/data/project', {
  headers: authHeaders,
  body: JSON.stringify({
    projectName: 'e2e-SK02-project',
    trackId: MISSING_TRACK_ID,
    trackName: 'e2e-SK02-missing',
  }),
});
if (!projectRes.ok) {
  throw new Error('SK-02: create project failed (' + projectRes.status + '): ' + projectRes.body);
}
const projectId = json(projectRes.body).id;

// 作成したプロジェクトに対する put-project の拒否も確認（既存プロジェクトが必要なためここで行う）
expectRejected(
  'put-project artworkKey (other user)',
  http.put(API_BASE_URL + '/data/project/' + projectId, {
    headers: authHeaders,
    body: JSON.stringify({ artworkKey: 'artworks/' + OTHER_USER + '/x.jpg' }),
  }),
);

const tracksRes = http.get(API_BASE_URL + '/data/track', { headers: authHeaders });
if (!tracksRes.ok) {
  throw new Error('SK-02: list tracks failed (' + tracksRes.status + '): ' + tracksRes.body);
}
const tracks = json(tracksRes.body);
for (let i = 0; i < tracks.length; i++) {
  const t = tracks[i];
  if (t.id === MISSING_TRACK_ID || (!t.title && !t.s3Key && !t.source)) {
    http.delete(API_BASE_URL + '/data/project/' + projectId, { headers: authHeaders });
    throw new Error('SK-02: broken track row found: ' + JSON.stringify(t));
  }
}

// 後始末
http.delete(API_BASE_URL + '/data/project/' + projectId, { headers: authHeaders });

output.sk01RejectedCases = rejectCases.length + 1;
output.sk02ProjectId = projectId;
