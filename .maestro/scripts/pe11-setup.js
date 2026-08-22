// PE-11 用データセットアップ（dev API を直接呼び出す）
//
// 「削除済みトラックを参照するプロジェクト」という UI 操作では作りにくい状態を
// API で再現する:
//   1. 過去の実行で残った e2e-PE11 プレフィックスのプロジェクトを削除（再実行を冪等にする）
//   2. ダミー s3Key のトラックを作成（S3 実体は不要。削除時の DeleteObject は
//      存在しないキーでも成功する）
//   3. そのトラックを紐づけたプロジェクトを作成
//   4. トラックを API で削除 → プロジェクト側に trackId が残り PE-11 の前提状態になる
//
// フロー側の env で API_BASE_URL / E2E_EMAIL / E2E_PASSWORD を渡すこと。
// 後続の runScript から使えるよう output.pe11ProjectId / output.pe11Token を設定する。

const headersJson = { 'Content-Type': 'application/json' };

const loginRes = http.post(API_BASE_URL + '/data/auth/login', {
  headers: headersJson,
  body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
});
if (!loginRes.ok) {
  throw new Error('PE-11 setup: login failed (' + loginRes.status + '): ' + loginRes.body);
}
const accessToken = json(loginRes.body).token.accessToken;
const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + accessToken,
};

// 1. 残骸掃除（前回失敗時の e2e-PE11 プロジェクトを削除）
const listRes = http.get(API_BASE_URL + '/data/project', { headers: authHeaders });
if (listRes.ok) {
  const projects = json(listRes.body);
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (p.projectName && p.projectName.indexOf('e2e-PE11') === 0) {
      http.delete(API_BASE_URL + '/data/project/' + p.id, { headers: authHeaders });
    }
  }
}

// 2. ダミートラック作成
const trackRes = http.post(API_BASE_URL + '/data/track', {
  headers: authHeaders,
  body: JSON.stringify({
    title: 'e2e-PE11-track',
    s3Key: 'tracks/e2e-pe11-dummy.mp3',
    extention: 'mp3',
  }),
});
if (!trackRes.ok) {
  throw new Error('PE-11 setup: create track failed (' + trackRes.status + '): ' + trackRes.body);
}
const trackId = json(trackRes.body).id;

// 3. トラックを紐づけたプロジェクト作成
const projectRes = http.post(API_BASE_URL + '/data/project', {
  headers: authHeaders,
  body: JSON.stringify({
    projectName: 'e2e-PE11-project',
    trackId: trackId,
    trackName: 'e2e-PE11-track',
  }),
});
if (!projectRes.ok) {
  throw new Error('PE-11 setup: create project failed (' + projectRes.status + '): ' + projectRes.body);
}
const projectId = json(projectRes.body).id;

// 4. トラック削除 → プロジェクトが削除済みトラックを参照する状態になる
const deleteRes = http.delete(API_BASE_URL + '/data/track/' + trackId, { headers: authHeaders });
if (!deleteRes.ok) {
  throw new Error('PE-11 setup: delete track failed (' + deleteRes.status + '): ' + deleteRes.body);
}

output.pe11ProjectId = projectId;
output.pe11Token = accessToken;
