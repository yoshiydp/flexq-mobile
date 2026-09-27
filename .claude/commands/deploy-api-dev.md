dev ブランチの最新状態から Lambda（SAM スタック `lyrics-dev-api`・開発者アカウント）を dev 環境へデプロイするコマンドです。

## 使うタイミング

- `api/` 配下（Lambda ハンドラー・`template.yaml`）に変更を含む PR が dev にマージされた直後

## 手順

```bash
# 1. dev の最新を一時 worktree に取得（ローカルの作業ブランチを汚さないため）
git fetch origin dev
git worktree add ../flexq-mobile-worktrees/dev-deploy origin/dev --detach

# 2. デプロイ対象の変更が含まれていることを確認（対象の Lambda ファイルを grep 等で確認）

# 3. ビルドとデプロイ（開発者アカウント・デフォルトプロファイル）
cd ../flexq-mobile-worktrees/dev-deploy/api
sam build
sam deploy --stack-name lyrics-dev-api --no-confirm-changeset

# 4. 成功確認: 出力に "Successfully created/updated stack - lyrics-dev-api" が出ること

# 5. スモークチェック: 必須の環境変数が空になっていないこと（TASK-88）
FN=$(aws lambda list-functions --region ap-northeast-1 \
  --query "Functions[?starts_with(FunctionName,'lyrics-dev-api-PostRecordSeparateFunction')].FunctionName" \
  --output text)
aws lambda get-function-configuration --function-name "$FN" --region ap-northeast-1 \
  --query "Environment.Variables.{replicate:REPLICATE_API_TOKEN,sender:SENDER_EMAIL,jwt:JWT_SECRET}" \
  --output json | python3 -c "import json,sys; v=json.load(sys.stdin); print({k:('SET' if (x or '') else 'EMPTY') for k,x in v.items()})"
# → いずれかが EMPTY の場合は手順 6 で値を明示して再デプロイする（値はログに出さない）

# 5-b. スモークチェック: JWT シークレットが旧テンプレートの既定値のままでないこと（TASK-106。カレントは手順 3 の api/ のまま）
API=https://e02397anue.execute-api.ap-northeast-1.amazonaws.com/v1
# 検証用トークン（旧既定値で HS256 署名・5 分で失効）。node 標準の crypto だけで作るため npm 依存なし
T=$(node -e 'const c=require("crypto"),b=o=>Buffer.from(JSON.stringify(o)).toString("base64url"),n=Math.floor(Date.now()/1000),h=b({alg:"HS256",typ:"JWT"}),p=b({userId:"probe",email:"probe@example.com",iat:n,exp:n+300});console.log(h+"."+p+"."+c.createHmac("sha256","lyrics-jwt-secret-change-in-production").update(h+"."+p).digest("base64url"))')
[ -n "$T" ] || echo "ERROR: probe token is empty. Fix before trusting the result (an empty token always yields 401)"
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $T" "$API/data/project"
# → 401 なら OK。200 が返る場合は既定シークレットのまま → 手順 6 で JwtSecret を新しい値にして再デプロイ
#   （dev の全ユーザーが再ログインになる。詳細は docs/jwt-secret-verification.md）

# 5-c. スモークチェック: 未認証の GET /data（旧 GetDataFunction）が消えていること（TASK-106）
curl -s -o /dev/null -w '%{http_code}\n' "$API/data"
# → 403（Missing Authentication Token）または 404 なら OK。200 なら古いテンプレートがデプロイされている

# 6. 空・既定値だったパラメータを補う場合のみ（通常は不要）
sam deploy --stack-name lyrics-dev-api --no-confirm-changeset \
  --parameter-overrides ReplicateApiToken="<token>"
# JwtSecret を差し替える場合（値はシェル変数に入れてログに残さない）
JWT=$(openssl rand -base64 32)
sam deploy --stack-name lyrics-dev-api --no-confirm-changeset \
  --parameter-overrides JwtSecret="$JWT"

# 7. メインリポジトリへ戻ってから一時 worktree を削除（worktree 内からは実行しない）
cd -   # 手順 3 の cd 前のディレクトリ（メインリポジトリ）へ戻る
git worktree remove --force ../flexq-mobile-worktrees/dev-deploy
```

## 注意事項

- **`--no-confirm-changeset` が必須**。`api/samconfig.toml` は `confirm_changeset = true` のため、付けないと確認プロンプトで停止する
- **`ReplicateApiToken` などの機微パラメータは「既存スタックの更新」でのみ前回値が保持される（UsePreviousValue）**。**スタックを新規作成した場合はテンプレートの `Default`（`ReplicateApiToken` は空文字）が入る**ため、必ず手順 5 のスモークチェックで空でないことを確認する（TASK-88: 3 スタックとも空のまま AI クリーンアップが全環境で 503 になっていた）
- **`JwtSecret` は `Default` を持たない必須パラメータ（TASK-106・32 文字以上）**。既存スタックの更新では未指定でも前回値が保持されるが、**新規作成時は `--parameter-overrides JwtSecret="$(openssl rand -base64 32)"` を必ず指定する**（未指定だとパラメータ検証で失敗する）。手順 5-b で既定シークレットの JWT が 401 になることを確認する
- トークン等の値は `--parameter-overrides` に直接書くとログに残る。シェル変数に入れて渡すか、出力を `sed` で伏字にする
- AWS 認証情報（`~/.aws`）が設定済みであること。エラー時はユーザーに確認する
- **staging（`flexq-stg-api`）へのデプロイは `/deploy-api-stg` を使う**（運営者アカウント・`AWS_PROFILE=flexq-ops` が必要）
- デプロイ後、dev エンドポイント URL（`https://e02397anue.execute-api.ap-northeast-1.amazonaws.com/v1`）は変わらない
