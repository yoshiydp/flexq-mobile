OpenAI Codex CLI でコードレビューを実行し、指摘への対応まで行うコマンドです。

## 使い方

```
/codex-review            # develop を基準にレビュー
/codex-review staging    # 基準ブランチを指定
```

## 前提チェック

1. `codex --version` で CLI の存在を確認する。未インストールなら以下を案内（または実行）する：
   ```bash
   npm install -g @openai/codex
   codex login   # ChatGPT アカウントでログイン（ユーザー操作が必要）
   ```
2. `codex login status` でログイン済みであることを確認する

## 手順

1. 未コミットの変更（新規ファイル含む）がある場合は `git add -A` でステージしてからレビューする（Codex は diff に含まれないファイルを見落とすため）
2. レビューを実行する：
   ```bash
   codex review --base develop
   ```
3. 指摘をトリアージする：
   - **妥当な指摘** → 修正し、`yarn test:ci --maxWorkers=2` と `yarn lint` を再実行してから再レビュー
   - **今回の diff と無関係な既存問題**（リポジトリ既存の tsc エラーなど）→ 対応せず、報告に「既存問題のため対象外」と明記
   - **誤検知** → 対応せず、判断理由を報告に明記
4. 指摘ゼロ（またはすべてトリアージ済み）になったら結果を報告する

## 報告事項

- 指摘の一覧と各対応（修正 / 既存問題 / 誤検知）
- 修正した場合はテスト・lint の再実行結果
