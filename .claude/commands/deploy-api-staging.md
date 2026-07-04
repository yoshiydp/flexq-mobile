staging ブランチの最新状態から Lambda（SAM スタック `lyrics-mock-api`）を AWS Staging へデプロイするコマンドです。

## 使うタイミング

- `api/` 配下（Lambda ハンドラー・`template.yaml`）に変更を含む PR が staging にマージされた直後

## 手順

```bash
# 1. staging の最新を一時 worktree に取得（ローカルの作業ブランチを汚さないため）
git fetch origin staging
git worktree add ../lyrics-mobile-worktrees/staging-deploy origin/staging --detach

# 2. デプロイ対象の変更が含まれていることを確認（対象の Lambda ファイルを grep 等で確認）

# 3. ビルドとデプロイ
cd ../lyrics-mobile-worktrees/staging-deploy/api
sam build
sam deploy --stack-name lyrics-mock-api --no-confirm-changeset

# 4. 成功確認: 出力に "Successfully created/updated stack - lyrics-mock-api" が出ること

# 5. 一時 worktree を削除
git worktree remove --force ../lyrics-mobile-worktrees/staging-deploy
```

## 注意事項

- **`--no-confirm-changeset` が必須**。`api/samconfig.toml` は `confirm_changeset = true` のため、付けないと確認プロンプトで停止する
- AWS 認証情報（`~/.aws`）が設定済みであること。エラー時はユーザーに確認する
- **Production（`lyrics-prod-api`）にはこのコマンドを使わない**。Production への反映は GitHub Actions の `Sync Schema to Production` ワークフローで行う
- デプロイ後、エンドポイント URL（`https://wn0u6fu695.execute-api.ap-northeast-1.amazonaws.com/v1`）は変わらない
