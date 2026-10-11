// QM-10〜QM-16（メモの共有）用データセットアップ（dev API を直接呼び出す）
//
// 書式付きの保存済みメモを API で作成し、メモ一覧の先頭に出す:
//   1. 過去の実行で残った e2e-QM10 プレフィックスのメモを削除（再実行を冪等にする）
//   2. 検証用のメモを 1 件作成する。本文はリッチエディター（tentap）が保存する形式の HTML で、
//      見出し・太字・下線・斜体・空の段落（連の区切り）・箇条書き・番号付き・日本語を含める。
//      ブックマーク付き・最新にして一覧の先頭に出す（ブックマーク付きが上・新しい順）
//
// フロー側の env で API_BASE_URL / E2E_EMAIL / E2E_PASSWORD を渡すこと。
// 後始末用に output.qm10MemoId / output.qm10Token を設定する。

const headersJson = { 'Content-Type': 'application/json' };

const loginRes = http.post(API_BASE_URL + '/data/auth/login', {
  headers: headersJson,
  body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
});
if (!loginRes.ok) {
  throw new Error('QM-10 setup: login failed (' + loginRes.status + '): ' + loginRes.body);
}
const accessToken = json(loginRes.body).token.accessToken;
const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + accessToken,
};

// 1. 残骸掃除（前回失敗時の e2e-QM10 メモを削除）
const listRes = http.get(API_BASE_URL + '/data/memo', { headers: authHeaders });
if (listRes.ok) {
  const memos = json(listRes.body);
  for (let i = 0; i < memos.length; i++) {
    const m = memos[i];
    if (m.title && m.title.indexOf('e2e-QM10') === 0) {
      http.delete(API_BASE_URL + '/data/memo/' + m.id, { headers: authHeaders });
    }
  }
}

// 2. 検証用メモを作成
const memoRes = http.post(API_BASE_URL + '/data/memo', {
  headers: authHeaders,
  body: JSON.stringify({
    title: 'e2e-QM10-share',
    body:
      '<h1>Verse</h1>' +
      '<p>夜明け前の街を</p>' +
      '<p>line <strong>bold</strong> <u>under</u> <em>italic</em></p>' +
      '<p></p>' +
      '<h2>Hook</h2>' +
      '<ul><li><p>item a</p></li><li><p>item b</p></li></ul>' +
      '<ol><li><p>first</p></li><li><p>second</p></li></ol>',
    isBookmarked: true,
  }),
});
if (!memoRes.ok) {
  throw new Error('QM-10 setup: create memo failed (' + memoRes.status + '): ' + memoRes.body);
}

output.qm10MemoId = json(memoRes.body).id;
output.qm10Token = accessToken;
