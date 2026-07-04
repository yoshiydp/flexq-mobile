このリポジトリのコミットメッセージ規約に従ってコミットを作成するコマンドです。

## 使い方

```
/commit
```

## 手順

1. `git status` と `git diff`（staged / unstaged）で変更内容を確認する
2. コミット対象のファイルをステージする（無関係な変更が混ざっていないか確認する）
3. 下記の規約でコミットメッセージを作成してコミットする

## コミットメッセージ規約

```
<type>: <英語の概要> (TASK-X)

<変更の理由と内容を日本語で説明する本文。
不具合修正なら「原因」と「何をどう直したか」が分かるように書く。>

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```

### ルール

- **タイトルは英語**の Conventional Commits 形式（`feat:` / `fix:` / `docs:` / `test:` / `refactor:` / `chore:`）で 70 文字以内
- ブランチ名に `TASK-X` が含まれる場合はタイトル末尾に `(TASK-X)` を付ける
- **本文は日本語**で必ず書く（タイトルだけのコミットにしない）。変更の背景・原因・対応内容を、後から読んで経緯が分かる粒度で記載する
- 末尾に Claude の Co-Authored-By トレーラーを付ける
- push はユーザーの指示があるまで行わない

### 例

```
fix: strip HTML tags from memo body preview in MemoItem (TASK-21)

QuickMemoScreen がリッチエディタの HTML 文字列を memo.body として保存するため、
MemoListScreen の MemoItem プレビューに <p> などのタグがそのまま表示されていた。
stripHtml ユーティリティを新規作成し、タグ除去後のプレーンテキストを表示するようにした。

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
```
