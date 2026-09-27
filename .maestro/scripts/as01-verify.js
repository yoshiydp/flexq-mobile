// AS-01 用 API 検証（dev API を直接呼び出す）
//
// BAN の 403 はアプリ側では通常のログイン失敗と同じ「Login Failed」アラートで表示されるため、
// UI アサートだけでは「BAN が効いている」ことを区別できない。そこで API レベルで
//   1. POST /data/auth/login が 403 かつ message が "Account suspended" であること
//   2. POST /data/auth/register が 400（reason: code_*）で拒否されること
//      = レコードが残るため同じ email では再登録できない。TASK-104 以降、register は
//      認証コードの検証を存在チェック（409）より先に行い、登録済みメールには
//      verification-code がコードを発行しない（案内メールのみ）ため、有効なコードが
//      存在し得ず必ず code_expired / code_invalid の 400 になる（409 には到達しない）。
//      ※ verification-code を実際に呼ぶと e2e-ban@example.com 宛に案内メールが送信される
//        （存在しない宛先で SES の到達率を下げる）ため、ここではダミーコードで register だけ叩く
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
if (registerRes.status !== 400) {
  throw new Error(
    'AS-01: expected re-register to be rejected with 400 but got ' + registerRes.status + ': ' + registerRes.body,
  );
}
const registerReason = String(json(registerRes.body).reason || '');
if (registerReason.indexOf('code_') !== 0) {
  throw new Error('AS-01: expected re-register to fail on the verification code (reason code_*) but got: ' + registerRes.body);
}

output.as01LoginStatus = loginRes.status;
output.as01RegisterStatus = registerRes.status;
