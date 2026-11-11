// ヒント動画（TASK-140）の撮影用: チュートリアル用アカウントの「My First Song」に歌詞を入れる（dev API を直接呼び出す）。
// 歌詞のエディタ（WebView）はシミュレーターで自動入力できないため、入力済みの状態から見せる。
// put-project は省略した projectName / cueButtons を空で上書きするため一緒に送る（トラックは保たれる）。
//
// フロー側の env で API_BASE_URL / TUTORIAL_EMAIL / TUTORIAL_PASSWORD / PROJECT_NAME を渡すこと。

const headersJson = { 'Content-Type': 'application/json' };

const loginRes = http.post(API_BASE_URL + '/data/auth/login', {
  headers: headersJson,
  body: JSON.stringify({ email: TUTORIAL_EMAIL, password: TUTORIAL_PASSWORD }),
});
if (!loginRes.ok) {
  throw new Error('set lyrics: login failed (' + loginRes.status + '): ' + loginRes.body);
}
const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + json(loginRes.body).token.accessToken,
};

const listRes = http.get(API_BASE_URL + '/data/project', { headers: authHeaders });
const projects = listRes.ok ? json(listRes.body) || [] : [];
let target = null;
for (let i = 0; i < projects.length; i++) {
  if (projects[i].projectName === PROJECT_NAME) target = projects[i];
}
if (!target) throw new Error('set lyrics: project not found: ' + PROJECT_NAME);

const putRes = http.put(API_BASE_URL + '/data/project/' + target.id, {
  headers: authHeaders,
  body: JSON.stringify({
    projectName: PROJECT_NAME,
    body:
      '<h2>Verse</h2>' +
      '<p>City lights are calling out my name</p>' +
      '<p>Running through the night, I feel the flame</p>' +
      '<p></p>' +
      '<h2>Hook</h2>' +
      "<p>We don't stop, we keep it moving</p>" +
      '<p>Every step a little louder</p>',
    cueButtons: [],
  }),
});
if (!putRes.ok) {
  throw new Error('set lyrics: update failed (' + putRes.status + '): ' + putRes.body);
}
output.tutorialLyrics = { projectId: target.id };
