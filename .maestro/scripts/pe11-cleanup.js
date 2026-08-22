// PE-11 用データ後始末（pe11-setup.js が作成したプロジェクトを削除する）
// フロー途中で失敗して実行されなかった場合も、次回の pe11-setup.js が
// e2e-PE11 プレフィックスの残骸を掃除するため放置してよい。

if (output.pe11ProjectId && output.pe11Token) {
  http.delete(API_BASE_URL + '/data/project/' + output.pe11ProjectId, {
    headers: { Authorization: 'Bearer ' + output.pe11Token },
  });
}
