// QM-10〜QM-16 用データ後始末（qm10-setup.js が作成したメモを削除する）
// フロー途中で失敗して実行されなかった場合も、次回の qm10-setup.js が
// e2e-QM10 プレフィックスの残骸を掃除するため放置してよい。

if (output.qm10MemoId && output.qm10Token) {
  http.delete(API_BASE_URL + '/data/memo/' + output.qm10MemoId, {
    headers: { Authorization: 'Bearer ' + output.qm10Token },
  });
}
