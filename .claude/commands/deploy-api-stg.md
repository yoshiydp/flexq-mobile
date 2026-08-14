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

# 5. メインリポジトリへ戻ってから一時 worktree を削除（worktree 内からは実行しない）
cd -   # 手順 3 の cd 前のディレクトリ（メインリポジトリ）へ戻る
git worktree remove --force ../flexq-mobile-worktrees/stg-deploy
```

## 注意事項

- **`AWS_PROFILE=flexq-ops` が必須**。運営者から受け取った CI 用 IAM ユーザー `flexq-deploy` のキーを `aws configure --profile flexq-ops` で登録済みであること。未登録の場合はユーザーに確認する
- **`--no-confirm-changeset` が必須**。`api/samconfig.toml` は `confirm_changeset = true` のため、付けないと確認プロンプトで停止する
- **production（`flexq-prod-api`）へのデプロイはこのコマンドの範囲外**。master マージ後に CLAUDE.md「SAM デプロイ（手動）」の production 手順で行う
- `JwtSecret` / `SenderEmail` / `ReplicateApiToken` などの設定済みパラメータは、未指定でも CloudFormation が前回値を保持する
- デプロイ後、staging エンドポイント URL（`https://5pzt12icve.execute-api.ap-northeast-1.amazonaws.com/v1`）は変わらない
