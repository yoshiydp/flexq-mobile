// NP-07 用の検証と後始末（dev API を直接呼び出す）
//
// 画面上の見た目だけでは「トラックのアートワークのフォールバック」と区別できないため、
// 作成されたプロジェクトに artworkKey 由来の artwork が保存されていることを API で確認する。
// 前提として、選んだトラックはアートワーク未設定（np07-setup.js が保証）なので、
// プロジェクトに artwork があれば CHANGE ARTWORK で選んだ画像が保存されたことになる。
// あわせて、既存トラック側が更新されていないことも確認する。
//
// フロー側の env で API_BASE_URL / E2E_EMAIL / E2E_PASSWORD / NP07_PROJECT_NAME を渡すこと。
// 対象トラックの ID は np07-setup.js が output.np07TrackId に入れたものを使う
// （output はフロー内のスクリプト間で共有される）。
// 確認後、作成したプロジェクトを削除して後始末する。

const np07TrackId = output.np07TrackId;
const np07TrackTitle = output.np07TrackTitle;
if (!np07TrackId || !np07TrackTitle) {
  throw new Error('NP-07 verify: output.np07Track* is missing (setup did not run?)');
}

const loginRes = http.post(API_BASE_URL + '/data/auth/login', {
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
});
if (!loginRes.ok) {
  throw new Error('NP-07 verify: login failed (' + loginRes.status + '): ' + loginRes.body);
}
const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + json(loginRes.body).token.accessToken,
};

const projectsRes = http.get(API_BASE_URL + '/data/project', { headers: authHeaders });
if (!projectsRes.ok) {
  throw new Error(
    'NP-07 verify: fetch projects failed (' + projectsRes.status + '): ' + projectsRes.body,
  );
}
const projects = json(projectsRes.body) || [];
let created = null;
for (let i = 0; i < projects.length; i++) {
  if ((projects[i].projectName || '').indexOf(NP07_PROJECT_NAME) === 0) {
    created = projects[i];
    break;
  }
}
if (!created) {
  throw new Error('NP-07 verify: created project not found: ' + NP07_PROJECT_NAME);
}

// 選んだトラックが紐づいていること
// （プロジェクト一覧 API は trackId を返さず、trackId があるときだけ
//   トラック名を引いて trackName として返すため、トラック名で照合する）
if (created.trackName !== np07TrackTitle) {
  throw new Error(
    'NP-07 verify: unexpected trackName: ' + created.trackName +
      ' (want ' + np07TrackTitle + ')',
  );
}

// 本題: アートワークが保存されていること（未設定ならデフォルト画像になる = 修正前の症状）
if (!created.artwork) {
  throw new Error(
    'NP-07 verify: artwork was not saved for the created project (artworkKey missing)',
  );
}
if (created.artwork.indexOf('/artworks/') === -1) {
  throw new Error('NP-07 verify: unexpected artwork URL: ' + created.artwork);
}

// 既存トラック側は変更しない（他プロジェクトと共有され得るため）
const tracksRes = http.get(API_BASE_URL + '/data/track', { headers: authHeaders });
const tracks = json(tracksRes.body) || [];
for (let i = 0; i < tracks.length; i++) {
  if (tracks[i].id === np07TrackId && tracks[i].artwork) {
    throw new Error('NP-07 verify: the selected track must not get an artwork');
  }
}

// 後始末（作成したプロジェクトを削除する）
const deleteRes = http.delete(API_BASE_URL + '/data/project/' + created.id, {
  headers: authHeaders,
});
if (!deleteRes.ok) {
  throw new Error(
    'NP-07 verify: cleanup failed (' + deleteRes.status + '): ' + deleteRes.body,
  );
}
