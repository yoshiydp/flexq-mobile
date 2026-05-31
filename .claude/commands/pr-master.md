develop から master への Pull Request を作成するコマンドです。
本番リリース前の最終マージに使用します。

## 手順

1. develop と master の差分コミットを確認する:
   ```bash
   git fetch origin
   git log origin/master..origin/develop --oneline
   ```
2. `gh pr create` で master ベースの PR を作成する

## PR 作成ルール

- `--base master --head develop` を必ず指定する
- タイトル: 含まれる TASK の概要をまとめて記載（例: `release: TASK-4, TASK-10 の修正をリリース`）
- 本文は以下のフォーマットを使う:

```
## Summary

develop → master へのリリース PR です。

### 含まれる変更

- TASK-X: 変更概要
- TASK-Y: 変更概要

## Test plan

- [ ] staging で全変更の動作確認済み
- [ ] lint・テスト通過済み

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## 注意事項

- master へのマージ後、GitHub Actions が自動で EAS Update を production チャンネルへデプロイする
- ネイティブコード変更を含む場合は EAS Update では反映されないため、`/testflight` コマンドで EAS Build を別途実行すること
