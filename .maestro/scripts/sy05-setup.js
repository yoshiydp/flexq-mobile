// SY-05 用データ準備（dev API を直接呼び出す）
//
// AI クリーンアップ済み（声のみ音源あり）のレコードは Replicate の実行（課金・数十秒）が
// 必要で、フローのたびに作るのは現実的でないため、dev の demo アカウントに用意済みの
// サンプル（SY05_PROJECT_ID のプロジェクト内・SY05_RECORD_TITLE のレコード）を
// 読み取り専用で使う。
//
// プロジェクト一覧は更新日時の降順のため、対象プロジェクトを（内容を変えずに）PUT して
// updatedAt を更新し、一覧の先頭（project-item-0）に表示させる。
// put-project は body / cueButtons / projectName を必須で上書きするため、
// 現在の値を取得してそのまま送り返す。
//
// フロー側の env で API_BASE_URL / E2E_EMAIL / E2E_PASSWORD / SY05_PROJECT_ID を渡すこと。

const headersJson = { 'Content-Type': 'application/json' };

const loginRes = http.post(API_BASE_URL + '/data/auth/login', {
  headers: headersJson,
  body: JSON.stringify({ email: E2E_EMAIL, password: E2E_PASSWORD }),
});
if (!loginRes.ok) {
  throw new Error('SY-05 setup: login failed (' + loginRes.status + '): ' + loginRes.body);
}
const accessToken = json(loginRes.body).token.accessToken;
const authHeaders = {
  'Content-Type': 'application/json',
  Authorization: 'Bearer ' + accessToken,
};

const detailRes = http.get(API_BASE_URL + '/data/project/' + SY05_PROJECT_ID, {
  headers: authHeaders,
});
if (!detailRes.ok) {
  throw new Error(
    'SY-05 setup: fetch project failed (' + detailRes.status + '): ' + detailRes.body,
  );
}
let project = json(detailRes.body);
if (Array.isArray(project)) project = project[0];
if (!project || !project.projectName) {
  throw new Error('SY-05 setup: sample project not found: ' + SY05_PROJECT_ID);
}

const updateRes = http.put(API_BASE_URL + '/data/project/' + SY05_PROJECT_ID, {
  headers: authHeaders,
  body: JSON.stringify({
    projectName: project.projectName,
    body: project.body || '',
    cueButtons: project.cueButtons || [],
  }),
});
if (!updateRes.ok) {
  throw new Error(
    'SY-05 setup: touch project failed (' + updateRes.status + '): ' + updateRes.body,
  );
}

// 対象レコードをブックマーク済みにして、REC MODE のレコード一覧の先頭付近
// （ブックマーク → 作成日降順）に表示させる。内側の一覧は表示領域が狭く、
// scrollUntilVisible が効かない（枠外の項目も階層上は「表示中」扱いになる）ため、
// スクロールなしでタップできる位置にあることを前提にする
const recordRes = http.put(API_BASE_URL + '/data/record/' + SY05_RECORD_ID, {
  headers: authHeaders,
  body: JSON.stringify({ isBookmarked: true }),
});
if (!recordRes.ok) {
  throw new Error(
    'SY-05 setup: bookmark record failed (' + recordRes.status + '): ' + recordRes.body,
  );
}
output.sy05ProjectName = project.projectName;
