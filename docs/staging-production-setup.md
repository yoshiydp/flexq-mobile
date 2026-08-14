# Staging / Production 環境構成

> ⚠️ **このドキュメントは旧 2 環境構成（`lyrics-mock-api` / `lyrics-prod-api`）の記録であり、現行の運用には使用しないこと。**
> 2026-08-09 に dev / staging / production の 3 環境構成へ移行済み（現行構成は `CLAUDE.md` と `docs/aws-account-migration-guide.md` を参照）。
> 本文中の `Sync Schema to Production` ワークフロー・旧スタックへのデプロイ手順は廃止済み（TASK-77）。

## 環境一覧

| 環境 | AWS スタック名 | Expo チャンネル | トリガー |
|------|--------------|----------------|---------|
| Staging | `lyrics-mock-api` | `staging` | `staging` ブランチへの push |
| Production | `lyrics-prod-api` | `production` | `master` ブランチへの push |

- 開発中（ローカル含む）は常に **Staging** DB を向く
- `production` チャンネルのアプリのみ **Production** DB を向く

---

## 環境変数

| ファイル | 内容 | git 管理 |
|---------|------|---------|
| `.env` | Staging の API Gateway URL | 管理対象 |
| `.env.local` | ローカル開発時に localhost へ上書き | gitignore 済み |

GitHub Secrets で Expo ビルド時の URL を環境ごとに切り替えます：

| Secret 名 | 用途 |
|-----------|------|
| `EXPO_PUBLIC_API_BASE_URL` | Staging API URL（deploy-staging.yml が使用） |
| `EXPO_PUBLIC_API_BASE_URL_PROD` | Production API URL（deploy-production.yml が使用） |

---

## GitHub Actions ワークフロー

### deploy-staging.yml
- トリガー: `staging` ブランチへの push
- 処理: ESLint → Jest → EAS Update（staging チャンネル、Staging DB）

### deploy-production.yml
- トリガー: `master` ブランチへの push
- 処理: ESLint → Jest → EAS Update（production チャンネル、Production DB）

### sync-schema-to-prod.yml
- トリガー: 手動（workflow_dispatch）
- 処理: Jest → SAM Deploy（`lyrics-prod-api` スタックへ）
- 用途: `template.yaml` のスキーマ変更を Production に反映する

---

## Production の初回セットアップ手順

### 1. Production SAM スタックを作成

```bash
cd api
sam build
sam deploy \
  --stack-name lyrics-prod-api \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides JwtSecret="<本番用の強いシークレット>" \
  --region ap-northeast-1
```

### 2. Production API URL を取得

デプロイ完了後、Outputs に表示される `ApiUrl` をコピーする。

```
Outputs
-------
Key   ApiUrl
Value https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/v1
```

### 3. GitHub Secrets を設定

GitHub リポジトリ → Settings → Secrets and variables → Actions に以下を追加：

| Secret 名 | 値 |
|-----------|---|
| `EXPO_PUBLIC_API_BASE_URL_PROD` | 手順 2 で取得した URL |
| `AWS_ACCESS_KEY_ID` | スキーマ同期用 IAM アクセスキー |
| `AWS_SECRET_ACCESS_KEY` | スキーマ同期用 IAM シークレットキー |
| `JWT_SECRET_PROD` | 手順 1 で指定したシークレットと同じ値 |

---

## スキーマ変更を Production へ反映する手順

`api/template.yaml` にテーブル・GSI・Lambda の変更が生じた場合：

1. Staging でデプロイ・動作確認を完了させる
2. GitHub → Actions タブ → `Sync Schema to Production` → `Run workflow`
3. 確認入力欄に `yes` と入力して実行
4. Jest テスト通過後、自動で `lyrics-prod-api` スタックへ反映される

> **注意:** テストが失敗した場合は Production へのデプロイは実行されません。

---

## 通常の開発フロー

```
feature/* ブランチで開発
  ↓
staging への PR → マージ
  ↓
GitHub Actions: ESLint + Jest + EAS Update (staging チャンネル)
  ↓ Staging で動作確認
master への PR → マージ
  ↓
GitHub Actions: ESLint + Jest + EAS Update (production チャンネル)
```

スキーマ変更が含まれる場合は、staging デプロイ後に `Sync Schema to Production` も実行する。
