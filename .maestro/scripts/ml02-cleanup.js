// ML-02 用データ後始末（ml02-setup.js が作成したメモを削除する）
// フロー途中で失敗して実行されなかった場合も、次回の ml02-setup.js が
// e2e-ML02 プレフィックスの残骸を掃除するため放置してよい。

if (output.ml02MemoId && output.ml02Token) {
  http.delete(API_BASE_URL + '/data/memo/' + output.ml02MemoId, {
    headers: { Authorization: 'Bearer ' + output.ml02Token },
  });
}
