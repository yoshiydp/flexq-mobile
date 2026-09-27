// NP-07 用データ準備（dev API を直接呼び出す）
//
// 「FROM TRACK LIST で既存トラックを選び、CHANGE ARTWORK で設定した画像が
// プロジェクトに保存される」ことを確認するため、以下を用意する。
//   1. 前回の残骸（e2e-np07 で始まるプロジェクト）を削除して冪等にする
//   2. アートワーク未設定のトラックを 1 件選び、PUT で updatedAt を更新して
//      トラック選択モーダルの先頭（track-picker-item-0）に表示させる
//      （put-track は title のみの部分更新に対応しているため、同じ title を送り返す）
//
// アートワーク「未設定」のトラックを使うのが重要で、設定済みトラックだと
// サーバー側のトラック artworkKey フォールバックが効いてしまい、
// 修正前のコードでもアートワークが表示され、バグを検出できない。
//
// フロー側の env で API_BASE_URL / E2E_EMAIL / E2E_PASSWORD / NP07_PROJECT_NAME を渡すこと。

const headersJson = { 'Content-Type': 'application/json' };

const loginRes = http.post(API_BASE_URL + '/data/auth/login', {
  headers: headersJson,
  body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
});
if (!loginRes.ok) {
  throw new Error('NP-07 setup: login failed (' + loginRes.status + '): ' + loginRes.body);
}
const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + json(loginRes.body).token.accessToken,
};

// 1. 前回の残骸を削除する
const projectsRes = http.get(API_BASE_URL + '/data/project', { headers: authHeaders });
if (!projectsRes.ok) {
  throw new Error(
    'NP-07 setup: fetch projects failed (' + projectsRes.status + '): ' + projectsRes.body,
  );
}
const projects = json(projectsRes.body) || [];
for (let i = 0; i < projects.length; i++) {
  const name = projects[i].projectName || '';
  if (name.indexOf(NP07_PROJECT_NAME) === 0) {
    http.delete(API_BASE_URL + '/data/project/' + projects[i].id, { headers: authHeaders });
  }
}

// 2. アートワーク未設定のトラックを一覧の先頭に出す
const tracksRes = http.get(API_BASE_URL + '/data/track', { headers: authHeaders });
if (!tracksRes.ok) {
  throw new Error(
    'NP-07 setup: fetch tracks failed (' + tracksRes.status + '): ' + tracksRes.body,
  );
}
const tracks = json(tracksRes.body) || [];
let target = null;
for (let i = 0; i < tracks.length; i++) {
  if (!tracks[i].artwork) {
    target = tracks[i];
    break;
  }
}
if (!target) {
  throw new Error('NP-07 setup: no track without artwork found in the demo account');
}

const touchRes = http.put(API_BASE_URL + '/data/track/' + target.id, {
  headers: authHeaders,
  body: JSON.stringify({ title: target.title }),
});
if (!touchRes.ok) {
  throw new Error(
    'NP-07 setup: touch track failed (' + touchRes.status + '): ' + touchRes.body,
  );
}

output.np07TrackId = target.id;
output.np07TrackTitle = target.title;
