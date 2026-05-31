現在のブランチから develop への Pull Request を作成するコマンドです。

## 手順

1. 現在のブランチ名・直近のコミット・差分を確認する
2. `gh pr create` で develop ベースの PR を作成する

## PR 作成ルール

- `--base develop` を必ず指定する
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

- staging で動作確認済みの場合は Test plan に「staging で確認済み」を明記する
- ネイティブコード変更を含む場合は「yarn ios でのネイティブリビルド必須」を明記する
