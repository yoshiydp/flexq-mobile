// SI-12 用 API 検証（dev API を直接呼び出す）
//
// TASK-132 の POST /data/auth/apple が、不正な identityToken を拒否することを確認する。
// 本物の Apple の署名付きトークンはテストから作れないため、成功系（SI-07〜SI-09）は
// 手動確認とし、ここでは「弾くべきものを弾く」ことだけを確かめる。
//   ① ボディが空                         → 400 Apple identity token is required
//   ② identityToken だけ（nonce なし）    → 400 Nonce is required
//   ③ JWT 形式でない文字列                → 401 Invalid Apple identity token
//   ④ Apple の鍵 ID（kid）を名乗るが、署名が Apple の鍵によるものではない JWT
//                                         → 401（署名検証で弾かれる）
//   ⑤ Apple に存在しない kid の JWT       → 401（鍵の取り直し後も見つからず弾かれる）
//   ⑥ ④ を mode: register で送る          → 401（新規作成を許す mode でも検証は省略されない）
//   ⑦ POST /data/profile/link-apple に未ログインで送る → 401 Unauthorized
// どのケースでもアカウントの作成・連携は行われない（401 / 400 で照合・作成の前に止まる）。
//
// フロー側の env で API_BASE_URL を渡すこと。

const headersJson = { 'Content-Type': 'application/json' };

// Maestro の JS 環境には btoa / Buffer が無いため、base64url を自前で組み立てる
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
function base64url(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    // テスト用の JSON は ASCII のみ
    bytes.push(code & 0xff);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | (b1 >> 4)];
    if (i + 1 < bytes.length) out += B64[((b1 & 15) << 2) | (b2 >> 6)];
    if (i + 2 < bytes.length) out += B64[b2 & 63];
  }
  return out;
}

function forgedToken(kid) {
  const header = base64url(JSON.stringify({ alg: 'RS256', kid: kid }));
  const payload = base64url(
    JSON.stringify({
      iss: 'https://appleid.apple.com',
      aud: 'com.yoshiydp.lyricsapp',
      sub: 'e2e-forged-apple-sub',
      iat: 1700000000,
      exp: 4102444800,
      email: 'e2e-forged-apple@example.com',
      email_verified: 'true',
    }),
  );
  return header + '.' + payload + '.' + base64url('not-a-real-signature');
}

function postApple(body) {
  return http.post(API_BASE_URL + '/data/auth/apple', {
    headers: headersJson,
    body: JSON.stringify(body),
  });
}

function expectStatus(label, res, status, messagePrefix) {
  if (res.status !== status) {
    throw new Error(
      label + ': expected ' + status + ' but got ' + res.status + ': ' + res.body,
    );
  }
  const message = json(res.body).message || '';
  if (message.indexOf(messagePrefix) !== 0) {
    throw new Error(
      label + ': expected "' + messagePrefix + '" but got: ' + res.body,
    );
  }
  // トークンが返っていない（ログインされていない）こと
  if (json(res.body).token) {
    throw new Error(label + ': a token must not be issued: ' + res.body);
  }
}

// Apple が実際に公開している鍵 ID を 1 つ使い、④ で署名検証まで到達させる
const keysRes = http.get('https://appleid.apple.com/auth/keys');
if (!keysRes.ok) {
  throw new Error('SI-12 setup: failed to fetch Apple keys (' + keysRes.status + ')');
}
const appleKid = json(keysRes.body).keys[0].kid;

expectStatus('① empty body', postApple({}), 400, 'Apple identity token is required');
expectStatus(
  '② no nonce',
  postApple({ identityToken: forgedToken(appleKid) }),
  400,
  'Nonce is required',
);
expectStatus(
  '③ not a JWT',
  postApple({ identityToken: 'not-a-jwt', rawNonce: 'e2e-nonce' }),
  401,
  'Invalid Apple identity token',
);
expectStatus(
  '④ forged signature with a real Apple kid',
  postApple({ identityToken: forgedToken(appleKid), rawNonce: 'e2e-nonce' }),
  401,
  'Invalid Apple identity token',
);
expectStatus(
  '⑤ unknown kid',
  postApple({
    identityToken: forgedToken('e2e-not-an-apple-key'),
    rawNonce: 'e2e-nonce',
  }),
  401,
  'Invalid Apple identity token',
);

// 新規作成を許す mode: register でも署名検証は省略されない（TASK-132）
expectStatus(
  '⑥ forged signature with mode register',
  postApple({
    identityToken: forgedToken(appleKid),
    rawNonce: 'e2e-nonce',
    mode: 'register',
  }),
  401,
  'Invalid Apple identity token',
);
// プロフィールからの Apple ID 連携はログインが必須（Authorization なしは 401）
expectStatus(
  '⑦ link-apple without login',
  http.post(API_BASE_URL + '/data/profile/link-apple', {
    headers: headersJson,
    body: JSON.stringify({
      identityToken: forgedToken(appleKid),
      rawNonce: 'e2e-nonce',
    }),
  }),
  401,
  'Unauthorized',
);

output.si12 = 'ok';
