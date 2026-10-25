# AGENTS.md

このファイルは、リポジトリ内のコードを操作する際に Codex CLI へのガイダンスを提供します。

## プロジェクトガイドは CLAUDE.md を参照

このリポジトリの開発コマンド・アーキテクチャ・環境構成・デプロイフロー・運用ルールは、
すべて **[CLAUDE.md](CLAUDE.md) に一元管理**しています。作業前に必ず CLAUDE.md を読んでください。
（以前は本ファイルに同内容を複製していましたが、二重管理による乖離を防ぐため参照方式に変更しました。）

## Codex 向けの補足

- スラッシュコマンドの定義ファイルは `.claude/commands/` にあります（`.Codex/commands/` ではありません）
- コードレビュー（`codex review --base develop`）では CLAUDE.md の規約を前提にしてください。特に:
  - `src/apiClient/` は自動生成のため手動編集不可（`api/openapi.yaml` → `yarn openapi` で再生成）
  - AWS は dev / staging / production の 3 環境構成。SAM デプロイでは `--stack-name` の明示が必須
  - コミットは英語タイトル（Conventional Commits）+ 日本語本文の規約に従う

## Cursor Cloud specific instructions

Linux の Cloud Agent では iOS シミュレーターと Android エミュレーターは使えない。`yarn ios` / `yarn android` と Maestro は実行しない。Expo Go もネイティブモジュールが無く起動できない。

- Node.js 20.11.0 は `$HOME/.local/node` にインストールされ、`~/.bashrc` と `/etc/profile.d/nodejs.sh` が PATH の先頭に置く。Yarn は Corepack の 4.12.0。
- 依存関係は `yarn install --immutable`。CI と同じ確認は `yarn lint --max-warnings=0`、`yarn typecheck`、`yarn test:ci`。
- 起動時はモック API（`yarn mock:server`）が port 3000 で動く。Swagger UI は http://localhost:3000/api-docs 。シードログインは `src/data/authData.ts` の `testuser@example.com` / `password123`。新規登録の認証コードは `123456`。
- `.env` の API URL は開発用 AWS。ローカルの API 確認はモックサーバーを使う。環境セットアップの過程で SAM デプロイや staging / production の変更はしない。
