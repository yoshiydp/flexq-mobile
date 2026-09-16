// ML-02 用データセットアップ（dev API を直接呼び出す）
//
// DRAFTS 画面の「MEMO LIST」ボタンはメモが 1 件以上ある場合のみ表示されるため
// （DraftsScreen の showListButton: memosHasItems）、前提となるメモを API で作成する:
//   1. 過去の実行で残った e2e-ML02 プレフィックスのメモを削除（再実行を冪等にする）
//   2. 検証用のメモを 1 件作成
//
// フロー側の env で API_BASE_URL / E2E_EMAIL / E2E_PASSWORD を渡すこと。
// 後始末用に output.ml02MemoId / output.ml02Token を設定する。

const headersJson = { 'Content-Type': 'application/json' };

const loginRes = http.post(API_BASE_URL + '/data/auth/login', {
  headers: headersJson,
  body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
});
if (!loginRes.ok) {
  throw new Error('ML-02 setup: login failed (' + loginRes.status + '): ' + loginRes.body);
}
const accessToken = json(loginRes.body).token.accessToken;
const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + accessToken,
};

// 1. 残骸掃除（前回失敗時の e2e-ML02 メモを削除）
const listRes = http.get(API_BASE_URL + '/data/memo', { headers: authHeaders });
if (listRes.ok) {
  const memos = json(listRes.body);
  for (let i = 0; i < memos.length; i++) {
    const m = memos[i];
    if (m.title && m.title.indexOf('e2e-ML02') === 0) {
      http.delete(API_BASE_URL + '/data/memo/' + m.id, { headers: authHeaders });
    }
  }
}

// 2. 検証用メモを作成（MEMO LIST ボタンの表示条件を満たす）
const memoRes = http.post(API_BASE_URL + '/data/memo', {
  headers: authHeaders,
  body: JSON.stringify({
    title: 'e2e-ML02-memo',
    body: 'e2e fixture for ML-02',
    isBookmarked: false,
  }),
});
if (!memoRes.ok) {
  throw new Error('ML-02 setup: create memo failed (' + memoRes.status + '): ' + memoRes.body);
}

output.ml02MemoId = json(memoRes.body).id;
output.ml02Token = accessToken;
