// PE-13〜PE-16 用データ後始末（pe13-setup.js が作成したプロジェクトを削除する）
// フロー途中で失敗して実行されなかった場合も、次回の pe13-setup.js が
// e2e-PE13 プレフィックスの残骸を掃除するため放置してよい。

if (output.pe13ProjectIds && output.pe13Token) {
  for (let i = 0; i < output.pe13ProjectIds.length; i++) {
    http.delete(API_BASE_URL + '/data/project/' + output.pe13ProjectIds[i], {
      headers: { Authorization: 'Bearer ' + output.pe13Token },
    });
  }
}
