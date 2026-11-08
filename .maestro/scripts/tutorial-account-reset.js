// チュートリアル（TASK-139）用アカウントのデータ初期化（dev API を直接呼び出す）
// 使用箇所: 動画撮影（.maestro/tutorial/01-login.yaml）と E2E（.maestro/flows/27-tutorial/）
//
// チュートリアル用アカウントのプロジェクトを全件削除し、PROJECT LIST を空状態
// （「プロジェクトがありません / NEW PROJECT」）に戻す。撮り直しのたびに実行する。
// トラックは消さない（FROM TRACK LIST で選ぶため）。
//
// フロー側の env で API_BASE_URL / TUTORIAL_EMAIL / TUTORIAL_PASSWORD を渡すこと。

const headersJson = { 'Content-Type': 'application/json' };

const loginRes = http.post(API_BASE_URL + '/data/auth/login', {
  headers: headersJson,
  body: JSON.stringify({ email: TUTORIAL_EMAIL, password: TUTORIAL_PASSWORD }),
});
if (!loginRes.ok) {
  throw new Error('tutorial reset: login failed (' + loginRes.status + '): ' + loginRes.body);
}
const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + json(loginRes.body).token.accessToken,
};

const projectsRes = http.get(API_BASE_URL + '/data/project', { headers: authHeaders });
if (!projectsRes.ok) {
  throw new Error(
    'tutorial reset: fetch projects failed (' + projectsRes.status + '): ' + projectsRes.body,
  );
}
const projects = json(projectsRes.body) || [];
for (let i = 0; i < projects.length; i++) {
  http.delete(API_BASE_URL + '/data/project/' + projects[i].id, { headers: authHeaders });
}

const tracksRes = http.get(API_BASE_URL + '/data/track', { headers: authHeaders });
const tracks = tracksRes.ok ? json(tracksRes.body) || [] : [];
if (tracks.length === 0) {
  throw new Error('tutorial reset: the tutorial account has no tracks (FROM TRACK LIST needs one)');
}
output.tutorialReset = { deletedProjects: projects.length, tracks: tracks.length };
