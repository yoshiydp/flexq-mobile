複数の Notion タスクを git worktree + サブエージェントで並行実装するコマンドです。

## 使い方

```
/task-parallel TASK-20 TASK-21 TASK-22
```

タスク ID が指定されていない場合は、対象のタスクをユーザーに確認してから進める。

## 手順

### 1. タスク詳細の取得

- Notion MCP で各タスクのページを取得する（データベース: `350780496c2f80dfaf79cba5e078123c`、データソース: `collection://35078049-6c2f-803a-bed7-000bc5727c7a`）
- タイトル・優先度・「不具合の内容 / 設計方針 / 修正内容」等の本文をすべて読み、エージェントに渡せるよう整理する
- タスク同士で変更ファイルが重なりそうな場合は、担当範囲（触ってよい箇所・触ってはいけない箇所）を各エージェントの指示に明記する

### 2. ブランチと worktree の作成

```bash
git fetch origin develop
git worktree add ../flexq-mobile-worktrees/TASK-X -b feature/TASK-X-brief-description origin/develop
```

- ブランチは必ず**最新の origin/develop** から作成する
- worktree の配置先は `../flexq-mobile-worktrees/TASK-X` に統一する

### 3. Notion ステータス更新

各タスクのステータスを `In progress` に更新する。

### 4. サブエージェントの並行起動

タスクごとに Agent ツールでサブエージェントを起動する。指示には以下を必ず含める：

- 作業場所は worktree のみ。メインリポジトリには一切触れない
- Notion タスクの本文（不具合の内容・設計方針・修正内容）をそのまま貼る
- 実行手順: `yarn install --immutable` → 実装 → `yarn test:ci --maxWorkers=2` と `yarn lint` を両方パス → `codex review --base develop`（指摘のうち妥当なものは修正して再テスト）→ コミット
- コミットメッセージは `/commit` の規約（英語タイトル + `(TASK-X)` + 日本語詳細本文 + Co-Authored-By）に従う
- **push は絶対にしない**。`sam build` / `sam deploy` も実行しない
- 報告事項: 変更ファイルと内容の要約、テスト・lint 結果、Codex レビューの指摘と対応、コミットハッシュ

### 5. 完了報告

全エージェントの完了後、以下をまとめてユーザーに報告する：

- タスクごとの変更概要・テスト結果・Codex レビュー結果・コミットハッシュ
- 同一ファイルを変更したタスクがある場合の推奨マージ順
- Lambda（`api/` 配下）に変更があるタスクは、マージ後に `/deploy-api-staging` が必要である旨

## 注意事項

- push と PR 作成はユーザーの指示を受けてから行う（PR 作成は `/pr-staging` の形式）
- staging マージ・動作確認後の処理は `/task-done` を使う
