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
- **タイトルは英語**で `release:` プレフィックス + 含まれる変更の概要（70 文字以内）。
  単一タスクなら内容を要約し、複数タスクなら TASK 番号を列挙する
  - 例: `release: TASK-44 sync offset fixes for AI-cleaned audio playback`
  - 例: `release: TASK-4, TASK-10 bugfixes`
- **本文は日本語**で以下のフォーマットを使う:

```
## Summary

develop → master へのリリース PR です。

### 含まれる変更

- TASK-X: 変更概要（修正が多層・複数 PR にわたる場合はサブ項目で内訳と staging PR 番号を記載）
- TASK-Y: 変更概要

## Test plan

- [ ] staging で全変更の動作確認済み（確認した内容・ビルド番号を記載）
- [ ] lint・テスト通過済み

## リリース時の注意

※ 該当する場合のみ記載する

- Lambda / `api/template.yaml` に変更がある場合: マージ後に `Sync Schema to Production` の手動実行が必要な旨
- ネイティブ変更がある場合: EAS Update では反映されず `/testflight` での EAS Build が必要な旨
- ユーザーデータへの影響（既存データが対象外・再生成が必要など）があればその旨

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## 注意事項

- master へのマージ後、GitHub Actions が自動で EAS Update を production チャンネルへデプロイする
- Lambda（`api/` 配下）や `api/template.yaml` に変更を含む場合、EAS Update では反映されない。マージ後に GitHub Actions の `Sync Schema to Production` ワークフローを手動実行すること（Replicate 系パラメータは渡されないが CloudFormation が前回値を保持する）
- ネイティブコード変更を含む場合は EAS Update では反映されないため、`/testflight` コマンドで EAS Build を別途実行すること
