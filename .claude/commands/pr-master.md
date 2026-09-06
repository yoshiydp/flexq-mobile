develop から master への Pull Request を作成するコマンドです。
本番リリース前の最終マージに使用します。

## 手順

1. develop と master の差分コミットを確認する:
   ```bash
   git fetch origin
   git log origin/master..origin/develop --oneline
   ```
2. `gh pr create` で master ベースの PR を作成する
3. **マージ後**、この PR に含まれる全タスクの Notion「リリース」チェックを OFF に戻す（後述の「マージ後の後処理」）

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

- Lambda / `api/template.yaml` に変更がある場合: マージ後に `flexq-prod-api` への手動 SAM デプロイが必要な旨
- ネイティブ変更がある場合: EAS Update では反映されず `/testflight` での EAS Build が必要な旨
- ユーザーデータへの影響（既存データが対象外・再生成が必要など）があればその旨

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## マージ後の後処理：リリースチェックのリセット

**master へのマージが完了したら、この PR に含まれた全タスクの Notion「リリース」チェックを OFF に戻す。**

「リリース」チェックは「**まだ production に出していない未リリース分**」を示すフィルタとして使っている。
master に入ったあとも ON のまま残すと、次のリリース PR でどこまでが新規分か判別できなくなる。
ステータスは **Done のまま維持**し、チェックだけを外す。

### 手順

1. PR に含まれる TASK 番号を、マージコミットの develop 側から抽出する:

   ```bash
   # <merge-sha> は今回のリリース PR のマージコミット（gh pr view <PR番号> --json mergeCommit -q .mergeCommit.oid）
   git fetch origin
   git log <merge-sha>^1..<merge-sha>^2 --oneline | grep -oE 'TASK-[0-9]+' | sort -u -t- -k2 -n
   ```

   マージ前に確認する場合は `git log origin/master..origin/develop --oneline | grep -oE 'TASK-[0-9]+' | sort -u -t- -k2 -n` でも同じ集合が得られる。

2. 抽出した各 TASK について Notion のページ ID を引き、`mcp__notion__API-patch-page` で
   `{"リリース": {"checkbox": false}}` を送る
   - ページ ID は `mcp__notion__API-post-search`（`filter` に `{"property": "object", "value": "page"}`、
     `sort` は `last_edited_time` の降順）の結果から ID プロパティで突き合わせる
   - `mcp__notion__API-query-data-source` は Notion のプラン制限で使えない（`invalid_request_url` になる）

3. 対象タスクのうち、リリース ON になっていなかったもの（develop 経由で master に入ったが
   `/task-done` を通していないもの）も同様に OFF のままで問題ない。**ステータスが Done でないタスクが
   含まれていた場合は、動作確認の漏れがないかユーザーに確認する**

## 注意事項

- master へのマージ後、GitHub Actions が自動で EAS Update を production チャンネルへデプロイする
- Lambda（`api/` 配下）や `api/template.yaml` に変更を含む場合、EAS Update では反映されない。マージ後に `flexq-prod-api` への手動 SAM デプロイ（`AWS_PROFILE=flexq-ops`。CLAUDE.md「SAM デプロイ（手動）」参照）を実行すること（`JwtSecret` などの設定済みパラメータは未指定でも CloudFormation が前回値を保持する）
- ネイティブコード変更を含む場合は EAS Update では反映されないため、`/testflight` コマンドで EAS Build を別途実行すること
