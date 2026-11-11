// ヒント動画（TASK-140）の撮影用: チュートリアル用アカウントに本文入りのメモを作る（dev API を直接呼び出す）。
// メモの本文のエディタ（WebView）はシミュレーターで自動入力できないため、タイトルの入力までを撮ったあと
// このメモを開いて「本文が入った状態 → SAVE → MEMO LIST に並ぶ」を続けて撮る（QM-10 / QM-11 と同じ方法）。
//
// フロー側の env で API_BASE_URL / TUTORIAL_EMAIL / TUTORIAL_PASSWORD / MEMO_TITLE を渡すこと。

const headersJson = { 'Content-Type': 'application/json' };

const loginRes = http.post(API_BASE_URL + '/data/auth/login', {
  headers: headersJson,
  body: JSON.stringify({ email: TUTORIAL_EMAIL, password: TUTORIAL_PASSWORD }),
});
if (!loginRes.ok) {
  throw new Error('create memo: login failed (' + loginRes.status + '): ' + loginRes.body);
}
const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + json(loginRes.body).token.accessToken,
};

const memoRes = http.post(API_BASE_URL + '/data/memo', {
  headers: authHeaders,
  body: JSON.stringify({
    title: MEMO_TITLE,
    body:
      '<p>Neon rain on an empty street</p>' +
      '<p>Heartbeat running with the bass and the beat</p>' +
      '<p></p>' +
      '<p>(hook idea: "we keep it moving")</p>',
    isBookmarked: false,
  }),
});
if (!memoRes.ok) {
  throw new Error('create memo: failed (' + memoRes.status + '): ' + memoRes.body);
}
output.tutorialMemo = { id: json(memoRes.body).id };
