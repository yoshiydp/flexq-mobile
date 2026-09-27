# JWT シークレットの確認手順（TASK-106）

`api/template.yaml` の `JwtSecret` には 2026-09 まで `Default: "lyrics-jwt-secret-change-in-production"` が付いていた。リポジトリを読める人なら誰でも知り得る値のため、`--parameter-overrides` を忘れてスタックを作成した環境では **誰でも任意ユーザーの JWT を偽造できる**状態になる。TASK-106 で `Default` を撤廃し（新規作成時は必須・`MinLength: 32`）、未認証の `GET /data`（`GetDataFunction`）も削除した。

このドキュメントは、稼働中の 3 スタック（`lyrics-dev-api` / `flexq-stg-api` / `flexq-prod-api`）が既定シークレットのままになっていないことを確認する手順をまとめたもの。**実行には各 AWS 環境の API を叩く必要があるため、開発者が手動で実施する**（Claude Code の自動モードでは実行しない）。

## 前提

- `node`（v16 以降。`Buffer.toString("base64url")` を使う）と `curl` が使えること。検証用トークンは node 標準の `crypto` だけで作るため `npm ci` は不要
- AWS 認証情報は不要（API Gateway を外部から叩くだけ）

## 1. 既定シークレットで署名した JWT が拒否されることを確認する

各エンドポイントに対して、旧既定値で署名したトークンで保護 API（`GET /data/project`）を呼ぶ。

```bash
# 旧テンプレートの既定値で HS256 署名した検証用トークン（5 分で失効）
T=$(node -e 'const c=require("crypto"),b=o=>Buffer.from(JSON.stringify(o)).toString("base64url"),n=Math.floor(Date.now()/1000),h=b({alg:"HS256",typ:"JWT"}),p=b({userId:"probe",email:"probe@example.com",iat:n,exp:n+300});console.log(h+"."+p+"."+c.createHmac("sha256","lyrics-jwt-secret-change-in-production").update(h+"."+p).digest("base64url"))')
# 空のトークンは常に 401 になり誤って OK 判定してしまうため、必ず中身があることを確認する
[ -n "$T" ] && echo "token length: ${#T}" || echo "ERROR: probe token is empty"

for API in \
  https://e02397anue.execute-api.ap-northeast-1.amazonaws.com/v1 \
  https://5pzt12icve.execute-api.ap-northeast-1.amazonaws.com/v1 \
  https://7ez5duggcc.execute-api.ap-northeast-1.amazonaws.com/v1 ; do
  printf '%s -> ' "$API"
  curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $T" "$API/data/project"
done
```

| 結果 | 意味 |
|------|------|
| `401` | OK。既定シークレットでは検証に失敗している（= 独自のシークレットが設定されている） |
| `200` | **NG。既定シークレットのまま**。`probe` という存在しないユーザーとして空のプロジェクト一覧が返っている。下記 3 で差し替える |
| それ以外（`403` / `5xx`） | エンドポイント URL・ステージ（`/v1`）・ネットワークを確認する。`403 Missing Authentication Token` はパスの打ち間違い |

`GET /data/project` を使う理由: `GET /data/profile` だと存在しないユーザーは 404 になり、既定値のままかどうかが 401 / 404 で判別しづらいため。`/data/project` は存在しないユーザーでも 200（空配列）を返す。

## 2. 未認証の `GET /data` が存在しないことを確認する

TASK-106 のテンプレートをデプロイ済みなら、`GetDataFunction` のルートは消えている。

```bash
for API in \
  https://e02397anue.execute-api.ap-northeast-1.amazonaws.com/v1 \
  https://5pzt12icve.execute-api.ap-northeast-1.amazonaws.com/v1 \
  https://7ez5duggcc.execute-api.ap-northeast-1.amazonaws.com/v1 ; do
  printf '%s -> ' "$API"
  curl -s -o /dev/null -w '%{http_code}\n' "$API/data"
done
```

| 結果 | 意味 |
|------|------|
| `403`（本文 `Missing Authentication Token`）または `404` | OK。ルートが存在しない |
| `200` | 旧テンプレート（`GetDataFunction` あり）がデプロイされたまま。その環境へ SAM デプロイする |

## 3. 既定値だった環境のシークレットを差し替える

**差し替えると、その環境で発行済みのアクセストークン・リフレッシュトークンがすべて無効になり、全ユーザーが再ログインになる**（アプリは 401 を受けて「セッションの有効期限が切れました」→ ログイン画面に戻る）。production で行う場合はテスター・運営者に事前に周知する。

`docs/aws-account-migration-guide.md` の記録では stg / prod は `openssl rand -base64 32` で新規発行、dev も `--parameter-overrides JwtSecret` を指定して作成しているため、通常はすべて 401 になるはず。既定値だった場合のみ以下を実行する（値をログに残さないようシェル変数に入れる）。

```bash
cd api && sam build

# dev（開発者アカウント）
JWT=$(openssl rand -base64 32)
sam deploy --stack-name lyrics-dev-api --no-confirm-changeset \
  --parameter-overrides JwtSecret="$JWT"

# staging（運営者アカウント）
JWT=$(openssl rand -base64 32)
AWS_PROFILE=flexq-ops sam deploy --stack-name flexq-stg-api \
  --region ap-northeast-1 --resolve-s3 --capabilities CAPABILITY_IAM --no-confirm-changeset \
  --parameter-overrides JwtSecret="$JWT"

# production（運営者アカウント）
JWT=$(openssl rand -base64 32)
AWS_PROFILE=flexq-ops sam deploy --stack-name flexq-prod-api \
  --region ap-northeast-1 --resolve-s3 --capabilities CAPABILITY_IAM --no-confirm-changeset \
  --parameter-overrides JwtSecret="$JWT"
```

- 環境ごとに別の値を使う（同じ値を使い回さない）
- production を差し替えた場合は GitHub Secrets の `JWT_SECRET_PROD` も同じ値に更新する（CLAUDE.md「GitHub Secrets（現行）」）
- 差し替え後、手順 1 を再実行して 401 になることを確認する

## 4. 今後の運用

- `JwtSecret` は `Default` を持たないため、**スタックの新規作成時は `--parameter-overrides JwtSecret=...` が必須**（未指定だと CloudFormation のパラメータ検証で失敗し、既定値で作られることはなくなった）。既存スタックの更新では未指定でも前回値が保持される（UsePreviousValue）
- `MinLength: 32` の制約があるため、既存スタックの現在値が 32 文字未満だと次回の更新がパラメータ検証で失敗する。その場合は上記 3 の手順で新しい値に差し替える（`openssl rand -base64 32` は 44 文字）
- `/deploy-api-dev` / `/deploy-api-stg` の手順 5-b / 5-c に手順 1・2 のスモークチェックを組み込んである。production への SAM デプロイ後も同じ確認を行う
- 手動テストケースは `docs/test-cases.md` の SK-04（既定シークレットの JWT が 401）/ SK-05（`GET /data` が 403 / 404）
