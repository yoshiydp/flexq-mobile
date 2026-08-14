現在のブランチから dev への Pull Request を作成するコマンドです。
dev ブランチはマージ専用の実機確認場所で、マージすると GitHub Actions が dev チャンネル（開発側 AWS: `lyrics-dev-api`）へ EAS Update を配信します。

## 手順

1. 現在のブランチ名・直近のコミット・差分を確認する
2. `gh pr create` で dev ベースの PR を作成する

## PR 作成ルール

- `--base dev` を必ず指定する
- タイトル: コミットメッセージの概要を元に簡潔にまとめる（70文字以内）
- ブランチ名に `TASK-X` が含まれる場合はタイトル末尾に `(TASK-X)` を付ける
- 本文は以下のフォーマットを使う:

```
## Summary

- 変更内容を箇条書きで簡潔に記載

## 変更ファイル

- 変更したファイルを列挙

## Test plan

- [ ] 確認項目を列挙

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## 注意事項

- ネイティブコード（yarn patch など）を含む場合は Test plan に「yarn ios でのネイティブリビルド必須」を明記する
- JS のみの変更の場合は「EAS Update で反映可能、ネイティブリビルド不要」を明記する
- Lambda（`api/` 配下）に変更を含む場合は、マージ後に `/deploy-api-dev` での SAM デプロイが必要な旨を明記する
- dev で実機確認が完了したら、同じブランチから develop への PR を作成する（`/task-done` が自動化）
