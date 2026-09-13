// AS-01 用 API 検証（dev API を直接呼び出す）
//
// BAN の 403 はアプリ側では通常のログイン失敗と同じ「Login Failed」アラートで表示されるため、
// UI アサートだけでは「BAN が効いている」ことを区別できない。そこで API レベルで
//   1. POST /data/auth/login が 403 かつ message が "Account suspended" であること
//   2. POST /data/auth/register が 409（レコードが残るため同じ email で再登録できない）であること
// を検証する。register は存在チェックが認証コードの検証より先に行われるため、
// コードはダミー値で問題ない。
//
// フロー側の env で API_BASE_URL / E2E_BAN_EMAIL / E2E_BAN_PASSWORD を渡すこと。
// 前提: scripts/e2e-ban.sh により E2E_BAN_EMAIL が suspended になっていること。

const headersJson = { 'Content-Type': 'application/json' };

const loginRes = http.post(API_BASE_URL + '/data/auth/login', {
  headers: headersJson,
  body: JSON.stringify({ email: E2E_BAN_EMAIL, password: E2E_BAN_PASSWORD }),
});
if (loginRes.status !== 403) {
  throw new Error(
    'AS-01: expected login to be rejected with 403 but got ' + loginRes.status + ': ' + loginRes.body +
      ' (scripts/e2e-ban.sh 経由で実行し、' + E2E_BAN_EMAIL + ' が BAN されているか確認してください)',
  );
}
const loginMessage = json(loginRes.body).message;
if (loginMessage !== 'Account suspended') {
  throw new Error('AS-01: expected message "Account suspended" but got: ' + loginRes.body);
}

const registerRes = http.post(API_BASE_URL + '/data/auth/register', {
  headers: headersJson,
  body: JSON.stringify({
    username: 'e2e-ban-again',
    email: E2E_BAN_EMAIL,
    password: E2E_BAN_PASSWORD,
    code: '000000',
  }),
});
if (registerRes.status !== 409) {
  throw new Error(
    'AS-01: expected re-register to be rejected with 409 but got ' + registerRes.status + ': ' + registerRes.body,
  );
}

output.as01LoginStatus = loginRes.status;
output.as01RegisterStatus = registerRes.status;
