dev で動作確認が完了したタスクの完了処理（Notion 更新 + develop への PR 作成）を行うコマンドです。

## 使い方

```
/task-done TASK-28
/task-done TASK-20 TASK-21 TASK-22   # 複数まとめても可
```

## 前提

- 対象タスクの dev PR がマージ済みであること
- **ユーザーが dev（実機・dev チャンネル）で動作確認を完了していること**（未確認の場合は実行せず、確認を依頼する）

## 手順

### 1. マージ確認

- Notion の対象タスクページから GitHub PR プロパティの PR 番号を取得する
- `gh pr view <番号> --json state,mergedAt` で `MERGED` であることを確認する。未マージなら中断してユーザーに報告する

### 2. Notion 更新

対象タスクのプロパティを更新する：

- ステータス → `Done`
- リリース → ON（`__YES__`）※ dev での動作確認完了 + develop 反映 = TestFlight / Play 配信対象の目印

### 3. develop への PR 作成

同じ feature ブランチから `--base develop` で PR を作成する（`/pr-develop` の形式に準拠）。加えて：

- 本文に `## 関連PR` セクションを設け、dev PR（`#番号（マージ済み・動作確認済み）`）を記載する
- Test plan には `- [x] dev で確認済み（確認した内容）` を明記する
- 同一ファイルを変更した他タスクの develop PR がある場合はマージ順の推奨を記載する

### 4. 報告

develop PR の URL とマージ順の注意点を報告する。develop マージ後に worktree の掃除（`git worktree remove ../flexq-mobile-worktrees/TASK-X`）を行う旨も伝える。

## 注意事項

- Lambda（`api/` 配下）に変更があるタスクは、develop マージ後の staging への反映に `/deploy-api-stg` が必要。未実施なら報告に含める
- production への反映（master マージ・`flexq-prod-api` への手動 SAM デプロイ）はこのコマンドの範囲外
