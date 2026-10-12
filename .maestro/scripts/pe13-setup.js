// PE-13〜PE-16（プロジェクト編集のリリック共有）用データセットアップ（dev API を直接呼び出す）
//
// 歌詞付きのプロジェクトと、歌詞が空のプロジェクトを API で作成する:
//   1. 過去の実行で残った e2e-PE13 プレフィックスのプロジェクトを削除（再実行を冪等にする）
//   2. e2e-PE13-share を作成し、歌詞（リッチエディター tentap が保存する形式の HTML）を設定する。
//      見出し・太字・下線・斜体・空の段落（連の区切り）・箇条書き・番号付き・日本語を含める
//   3. e2e-PE13-empty を作成する（歌詞なし。プロジェクト名だけでは共有しないことの確認用）
// トラックは設定しない（共有の確認に音源は不要。トラック無しでも編集画面は開ける）。
// post-project は body を受け付けないため、作成後に put-project で歌詞を入れる。
// put-project は省略した projectName を空文字で上書きするため、projectName も一緒に送る。
//
// フロー側の env で API_BASE_URL / E2E_EMAIL / E2E_PASSWORD を渡すこと。
// 後始末用に output.pe13ProjectIds / output.pe13Token を設定する。

const headersJson = { 'Content-Type': 'application/json' };

const loginRes = http.post(API_BASE_URL + '/data/auth/login', {
  headers: headersJson,
  body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
});
if (!loginRes.ok) {
  throw new Error('PE-13 setup: login failed (' + loginRes.status + '): ' + loginRes.body);
}
const accessToken = json(loginRes.body).token.accessToken;
const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + accessToken,
};

// 1. 残骸掃除（前回失敗時の e2e-PE13 プロジェクトを削除）
const listRes = http.get(API_BASE_URL + '/data/project', { headers: authHeaders });
if (listRes.ok) {
  const projects = json(listRes.body);
  for (let i = 0; i < projects.length; i++) {
    const p = projects[i];
    if (p.projectName && p.projectName.indexOf('e2e-PE13') === 0) {
      http.delete(API_BASE_URL + '/data/project/' + p.id, { headers: authHeaders });
    }
  }
}

function createProject(projectName) {
  const res = http.post(API_BASE_URL + '/data/project', {
    headers: authHeaders,
    body: JSON.stringify({ projectName: projectName }),
  });
  if (!res.ok) {
    throw new Error('PE-13 setup: create project failed (' + res.status + '): ' + res.body);
  }
  return json(res.body).id;
}

// 3. 歌詞が空のプロジェクト（先に作り、一覧で歌詞付きのプロジェクトより下に来るようにする）
const emptyProjectId = createProject('e2e-PE13-empty');

// 2. 歌詞付きのプロジェクト
const shareProjectId = createProject('e2e-PE13-share');
const putRes = http.put(API_BASE_URL + '/data/project/' + shareProjectId, {
  headers: authHeaders,
  body: JSON.stringify({
    projectName: 'e2e-PE13-share',
    body:
      '<h1>Verse</h1>' +
      '<p>夜明け前の街を</p>' +
      '<p>line <strong>bold</strong> <u>under</u> <em>italic</em></p>' +
      '<p></p>' +
      '<h2>Hook</h2>' +
      '<ul><li><p>item a</p></li></ul>' +
      '<ol><li><p>first</p></li><li><p>second</p></li></ol>',
    cueButtons: [],
  }),
});
if (!putRes.ok) {
  throw new Error('PE-13 setup: set lyrics failed (' + putRes.status + '): ' + putRes.body);
}

output.pe13ProjectIds = [shareProjectId, emptyProjectId];
output.pe13Token = accessToken;
