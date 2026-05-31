Notionのタスク管理操作を行うコマンドです。以下の操作に対応しています。

## 設定

- Notion API Token: `.claude/settings.local.json` の `NOTION_API_KEY` を参照
- データベースID: `35078049-6c2f-80df-af79-cba5e078123c`
- API Base URL: `https://api.notion.com/v1`

## 操作一覧

### タスク追加
「タスクを追加して」と伝えられたら以下を実行：
1. データベースの全タスクを取得し、IDプロパティの最大番号を確認して次の TASK-X を決定
2. curl で `POST /v1/pages` を呼び出してタスクを作成
3. ページ本文に `## 詳細` セクションを挿入

必須プロパティ:
- タイトル（title）
- ID（rich_text）: TASK-X 形式
- ステータス（status）: デフォルト "Not started"
- 優先度（select）: Low / Middle / High
- デバイス（select）: Android / iPhone
- 簡単な詳細（rich_text）: 任意

### ステータス更新
「TASK-X を〇〇にして」と伝えられたら以下を実行：
1. データベースをクエリして対象ページIDを取得
2. `PATCH /v1/pages/{page_id}` でステータスを更新

ステータス値: "Not started" / "In progress" / "Done" / "Pending"

### GitHub PR URL 登録
「TASK-X に PR URL を登録して」と伝えられたら以下を実行：
1. データベースをクエリして対象ページIDを取得
2. `PATCH /v1/pages/{page_id}` で GitHub PR プロパティを更新

### ページ内容の追記・更新
「TASK-X に〇〇を追記して」「TASK-X の〇〇を修正して」と伝えられたら以下を実行：
1. データベースをクエリして対象ページIDを取得
2. 追記の場合: `PATCH /v1/blocks/{page_id}/children` でブロックを追加
3. 更新の場合: `GET /v1/blocks/{page_id}/children` で既存ブロックIDを取得後、`PATCH /v1/blocks/{block_id}` で更新

## 実装ルール

- Notion MCP ツール（`mcp__notion__*`）が利用可能な場合は優先して使用する
- 利用できない場合は curl で Notion REST API を直接呼び出す
- API トークンは以下のコマンドで取得する:
  ```bash
  cat "/Volumes/SHPP41-2 000GM Media/projects/lyrics-template/apps/mobile/.claude/settings.local.json" | python3 -c "import json,sys; d=json.load(sys.stdin); [print(v) for s in d.get('mcpServers',{}).values() for k,v in s.get('env',{}).items() if 'NOTION' in k]"
  ```
- レスポンスの `object` が `page` / `list` / `block` であれば成功
- コードブロックの language は Notion が受け付ける値を使うこと（例: `objective-c` ではなく `objective-c` が無効なら `plain text`）
