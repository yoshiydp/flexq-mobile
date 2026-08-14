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
