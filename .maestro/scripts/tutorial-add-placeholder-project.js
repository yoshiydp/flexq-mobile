// 初回チュートリアルの動画（TASK-139）の撮影用: 一覧の表示後に API で 2 件目のプロジェクトを足しておき、
// 撮影の最後に開く編集画面でプロジェクト編集の初回ヒント（TASK-140）が出ないようにする
// （ヒントは「プロジェクトが 2 件以上」のユーザーには出ない。一覧は撮影中に読み直さないため映らない）。
// 次回の tutorial-account-reset.js で削除される。
//
// フロー側の env で API_BASE_URL / TUTORIAL_EMAIL / TUTORIAL_PASSWORD を渡すこと。

const headersJson = { 'Content-Type': 'application/json' };

const loginRes = http.post(API_BASE_URL + '/data/auth/login', {
  headers: headersJson,
  body: JSON.stringify({ email: TUTORIAL_EMAIL, password: TUTORIAL_PASSWORD }),
});
if (!loginRes.ok) {
  throw new Error('placeholder project: login failed (' + loginRes.status + '): ' + loginRes.body);
}
const res = http.post(API_BASE_URL + '/data/project', {
  headers: {
    'Content-Type': 'application/json',
    Authorization: 'Bearer ' + json(loginRes.body).token.accessToken,
  },
  body: JSON.stringify({ projectName: 'e2e-tutorial-placeholder' }),
});
if (!res.ok) {
  throw new Error('placeholder project: create failed (' + res.status + '): ' + res.body);
}
output.tutorialPlaceholderProject = json(res.body).id;
