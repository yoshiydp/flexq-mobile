develop ブランチの最新状態から Lambda（SAM スタック `flexq-stg-api`・運営者アカウント）を staging 環境へデプロイするコマンドです。

## 使うタイミング

- `api/` 配下（Lambda ハンドラー・`template.yaml`）に変更を含む PR が develop にマージされた直後

## 手順

```bash
# 1. develop の最新を一時 worktree に取得（ローカルの作業ブランチを汚さないため）
git fetch origin develop
git worktree add ../flexq-mobile-worktrees/stg-deploy origin/develop --detach

# 2. デプロイ対象の変更が含まれていることを確認（対象の Lambda ファイルを grep 等で確認）

# 3. ビルドとデプロイ（運営者アカウント・flexq-ops プロファイル）
cd ../flexq-mobile-worktrees/stg-deploy/api
sam build
AWS_PROFILE=flexq-ops sam deploy --stack-name flexq-stg-api \
  --region ap-northeast-1 --resolve-s3 --capabilities CAPABILITY_IAM --no-confirm-changeset

# 4. 成功確認: 出力に "Successfully created/updated stack - flexq-stg-api" が出ること

# 5. スモークチェック: 必須の環境変数が空・不正になっていないこと（TASK-88）
FN=$(AWS_PROFILE=flexq-ops aws lambda list-functions --region ap-northeast-1 \
  --query "Functions[?starts_with(FunctionName,'flexq-stg-api-PostRecordSeparateFunction')].FunctionName" \
  --output text)
AWS_PROFILE=flexq-ops aws lambda get-function-configuration --function-name "$FN" --region ap-northeast-1 \
  --query "Environment.Variables.{replicate:REPLICATE_API_TOKEN,jwt:JWT_SECRET}" \
  --output json | python3 -c "import json,sys; v=json.load(sys.stdin); print({k:('SET' if (x or '') else 'EMPTY') for k,x in v.items()})"
AWS_PROFILE=flexq-ops aws lambda get-function-configuration --function-name "$FN" --region ap-northeast-1 \
  --query "Environment.Variables.SENDER_EMAIL" --output text   # 正しいメールアドレスのみであること

# 5-b. スモークチェック: JWT シークレットが旧テンプレートの既定値のままでないこと（TASK-106。カレントは手順 3 の api/ のまま）
API=https://5pzt12icve.execute-api.ap-northeast-1.amazonaws.com/v1
# 検証用トークン（旧既定値で HS256 署名・5 分で失効）。node 標準の crypto だけで作るため npm 依存なし
T=$(node -e 'const c=require("crypto"),b=o=>Buffer.from(JSON.stringify(o)).toString("base64url"),n=Math.floor(Date.now()/1000),h=b({alg:"HS256",typ:"JWT"}),p=b({userId:"probe",email:"probe@example.com",iat:n,exp:n+300});console.log(h+"."+p+"."+c.createHmac("sha256","lyrics-jwt-secret-change-in-production").update(h+"."+p).digest("base64url"))')
[ -n "$T" ] || echo "ERROR: probe token is empty. Fix before trusting the result (an empty token always yields 401)"
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $T" "$API/data/project"
# → 401 なら OK。200 が返る場合は既定シークレットのまま → 手順 6 で JwtSecret を新しい値にして再デプロイ
#   （staging の全ユーザー（TestFlight / Play 内部テスト）が再ログインになる。詳細は docs/jwt-secret-verification.md）

# 5-c. スモークチェック: 未認証の GET /data（旧 GetDataFunction）が消えていること（TASK-106）
curl -s -o /dev/null -w '%{http_code}\n' "$API/data"
# → 403（Missing Authentication Token）または 404 なら OK。200 なら古いテンプレートがデプロイされている

# 6. 空・不正・既定値だったパラメータを補う場合のみ
AWS_PROFILE=flexq-ops sam deploy --stack-name flexq-stg-api \
  --region ap-northeast-1 --resolve-s3 --capabilities CAPABILITY_IAM --no-confirm-changeset \
  --parameter-overrides ReplicateApiToken="<token>" SenderEmail="yoshihisa.watanabe.info@gmail.com"
# JwtSecret を差し替える場合（値はシェル変数に入れてログに残さない）
JWT=$(openssl rand -base64 32)
AWS_PROFILE=flexq-ops sam deploy --stack-name flexq-stg-api \
  --region ap-northeast-1 --resolve-s3 --capabilities CAPABILITY_IAM --no-confirm-changeset \
  --parameter-overrides JwtSecret="$JWT"

# 7. メインリポジトリへ戻ってから一時 worktree を削除（worktree 内からは実行しない）
cd -   # 手順 3 の cd 前のディレクトリ（メインリポジトリ）へ戻る
git worktree remove --force ../flexq-mobile-worktrees/stg-deploy
```

## 注意事項

- **`AWS_PROFILE=flexq-ops` が必須**。運営者から受け取った CI 用 IAM ユーザー `flexq-deploy` のキーを `aws configure --profile flexq-ops` で登録済みであること。未登録の場合はユーザーに確認する
- **`--no-confirm-changeset` が必須**。`api/samconfig.toml` は `confirm_changeset = true` のため、付けないと確認プロンプトで停止する
- **production（`flexq-prod-api`）へのデプロイはこのコマンドの範囲外**。master マージ後に CLAUDE.md「SAM デプロイ（手動）」の production 手順で行う
- `JwtSecret` / `SenderEmail` / `ReplicateApiToken` などの設定済みパラメータは、**既存スタックの更新時のみ**未指定でも CloudFormation が前回値を保持する（UsePreviousValue）。**スタックを新規作成した場合はテンプレートの `Default`（`ReplicateApiToken` は空文字）が入る**ため、手順 5 のスモークチェックを必ず行う（TASK-88: 3 スタックとも空のまま AI クリーンアップが全環境で 503 になっていた）
- **`JwtSecret` は `Default` を持たない必須パラメータ（TASK-106・32 文字以上）**。**新規作成時は `--parameter-overrides JwtSecret="$(openssl rand -base64 32)"` を必ず指定する**（未指定だとパラメータ検証で失敗する）。手順 5-b で既定シークレットの JWT が 401 になることを確認する。production（`flexq-prod-api`）も同じ確認を行う（エンドポイント `https://7ez5duggcc.execute-api.ap-northeast-1.amazonaws.com/v1`）
- トークン等の値は `--parameter-overrides` に直接書くとログに残る。シェル変数に入れて渡すか、出力を `sed` で伏字にする
- デプロイ後、staging エンドポイント URL（`https://5pzt12icve.execute-api.ap-northeast-1.amazonaws.com/v1`）は変わらない
