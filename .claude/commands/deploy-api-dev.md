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

# 5. メインリポジトリへ戻ってから一時 worktree を削除（worktree 内からは実行しない）
cd -   # 手順 3 の cd 前のディレクトリ（メインリポジトリ）へ戻る
git worktree remove --force ../flexq-mobile-worktrees/dev-deploy
```

## 注意事項

- **`--no-confirm-changeset` が必須**。`api/samconfig.toml` は `confirm_changeset = true` のため、付けないと確認プロンプトで停止する
- AWS 認証情報（`~/.aws`）が設定済みであること。エラー時はユーザーに確認する
- **staging（`flexq-stg-api`）へのデプロイは `/deploy-api-stg` を使う**（運営者アカウント・`AWS_PROFILE=flexq-ops` が必要）
- デプロイ後、dev エンドポイント URL（`https://e02397anue.execute-api.ap-northeast-1.amazonaws.com/v1`）は変わらない
