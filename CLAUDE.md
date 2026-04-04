# CLAUDE.md

このファイルは、リポジトリ内のコードを操作する際に Claude Code (claude.ai/code) へのガイダンスを提供します。

## コマンド

```bash
# 開発
yarn start                # Expo 開発サーバー起動 (iOS/Android/Web)
yarn ios                  # iOS シミュレーター
yarn android              # Android エミュレーター

# Lint & フォーマット
yarn lint                 # expo lint (CI では --max-warnings=0)

# テスト
yarn test                 # Jest ウォッチモード
yarn test:ci              # Jest カバレッジ付き実行 (CI)

# 単一テストファイルの実行
yarn test src/components/ui/buttons/ArrowButton/ArrowButton.test.tsx

# モック API サーバー (Swagger UI: http://localhost:3000)
yarn mock:server

# OpenAPI クライアント生成
yarn generate:openapi     # src/data/ から src/apiClient/ を生成

# AWS SAM (api/ ディレクトリで実行)
cd api
sam build                 # Lambda 関数をビルド
sam deploy                # AWS にデプロイ (初回は --guided)
```

## アーキテクチャ

### ナビゲーション

アプリのルーターには expo-router ではなく **React Navigation**（Stack + Bottom Tabs）を使用しています。`src/app/` ディレクトリは最小限で、ルートレイアウトのラップのみを担当します。

- `src/App.tsx` — エントリーポイント。フォント読み込みと `NavigationContainer` + `RootNavigator` のレンダリング
- `src/navigation/RootNavigator.tsx` — 認証ゲート: 認証済み → `HomeTabs`、未認証 → `SignIn`
- `src/navigation/HomeTabsNavigator.tsx` — カスタム `NavigationBar` を使った 4 つのボトムタブ (ProjectList, TrackList, Profile, Drafts)
- モーダル/オーバーレイ系画面 (ProjectEdit, AudioPlayer, QuickRecord, ProfileEdit など) はスタックナビゲーターにプッシュ

### レイアウト

`src/layouts/` に 2 種類のレイアウトラッパーがあります：
- `DefaultLayout` — `ModalProvider` が必要な画面をラップ
- `OverlayDefaultLayout` — オーバーレイ/モーダル画面用 (ProfileEdit, ProjectSettings)

### 状態管理

- **AuthContext** (`src/contexts/AuthContext.tsx`) — ユーザー認証状態、ログイン/ログアウト、`src/utils/authStorage.ts` (AsyncStorage) によるトークン永続化
- **ModalContext** (`src/contexts/ModalContext.tsx`) — アプリ全体のモーダル管理: 確認ダイアログ、入力モーダル、録音 UI、フルスクリーンローディングオーバーレイ

### データフェッチ

`src/hooks/` のカスタムフックは一貫したパターンに従います：
```typescript
// { data, loading, error, refresh } を返す
const { data, loading } = useFetchProject();
```
これらは `src/apiClient/` の自動生成 API クライアントから `DefaultService.*()` メソッドを呼び出します。

### モック API & API クライアント

API クライアント (`src/apiClient/`) は `openapi-typescript-codegen` で**自動生成**されるため、手動編集は不可です。更新する場合：
1. `src/data/*.ts` のデータを編集
2. `yarn generate:openapi` を実行して `api/openapi.yaml` と `src/apiClient/` を再生成

モックサーバー (`yarn mock:server`) はこのデータを Express でローカルに配信します。

### AWS API Gateway (本番モック環境)

モックデータは AWS Lambda + API Gateway にもデプロイされています。

- **エンドポイント**: `https://wn0u6fu695.execute-api.ap-northeast-1.amazonaws.com/v1`
- **リージョン**: `ap-northeast-1`（東京）
- **SAM テンプレート**: `api/template.yaml`
- **スタック名**: `lyrics-mock-api`

`src/App.tsx` の起動時に `OpenAPI.BASE` を環境変数で設定しています：

```typescript
OpenAPI.BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
```

**環境変数ファイル:**
- `.env` — AWS URL を定義（git 管理対象）
- `.env.local` — ローカル開発時に localhost へ上書き（gitignore 済み）

**モックデータを更新してAWSに反映する手順:**
1. `src/data/*.ts` を編集
2. `cd api && sam build && sam deploy`

**ツール要件:** AWS SAM CLI (`brew install aws-sam-cli`), esbuild (`npm install -g esbuild`)

### デプロイフロー (staging)

feature ブランチの変更を staging へデプロイする手順：

```bash
# 1. feature ブランチを作成
git checkout develop
git checkout -b feature/your-feature-name

# 2. 変更・コミット・プッシュ
git add <files>
git commit -m "feat: your changes"
git push origin feature/your-feature-name
```

**3. GitHub で staging への PR を作成・マージ**
- PR の base ブランチを `staging` に設定して作成
- マージすると GitHub Actions が自動実行

**4. GitHub Actions の自動実行フロー**
```
staging へのマージを検知
  ↓ ESLint チェック
  ↓ Jest テスト
  ↓ 両方通過 → EAS Update で Expo staging チャンネルへデプロイ
```

**5. iPhone で確認**
- Expo Go を完全に終了して再起動
- 最新の update が自動適用される

**GitHub Actions の実行状況確認:**
- リポジトリの Actions タブ → `Deploy to Staging (EAS Update)`

**注意:** lint または test が失敗した場合はデプロイが中止されます。

### パスエイリアス

`@/` は `src/` に対応します。`tsconfig.json`、`babel.config.js` (module-resolver)、`jest.config.js` (moduleNameMapper) で設定されています。

### スタイリング

- グローバルカラーパレット: `src/globalStyles/colors.ts` (ゴールドアクセントのダークテーマ)
- コンポーネントスタイルは React Native の `StyleSheet.create()` を使用し、各コンポーネントと同じ場所に配置

### テスト

テストはソースファイルと同じ場所に配置します (`Component.tsx` の隣に `Component.test.tsx`)。`@testing-library/react-native` を使用。Expo モジュールとアイコンのモックは `__mocks__/` と `jest.setup.js` にあります。

---

## 実際のCRUD APIへの移行

### アーキテクチャ概要

```
Mobile (Expo)
  ↓ JWT 認証付き REST API
AWS API Gateway
  ↓
Lambda (Node.js + esbuild)
  ↓             ↓
DynamoDB       S3
(メタデータ)  (音源・画像ファイル)
```

**音源・画像ファイルは S3 Presigned URL 経由でアップロード・取得します。**
Lambda は 6MB のペイロード制限があるため、ファイルを Lambda 経由では送受信しません。

### DynamoDB テーブル設計

全テーブルが複合キー構造 `PK=userId, SK=<resourceId>` を使用します。

| テーブル | SAM リソース名 | SK |
|---------|--------------|-----|
| Tracks | `TracksTable` | `trackId` |
| Memos | `MemosTable` | `memoId` |
| Projects | `ProjectsTable` | `projectId` |
| Users | `UsersTable` | `userId` |

### S3 バケット

| バケット | SAM リソース名 | 用途 |
|--------|--------------|------|
| `TrackAudioBucket` | `TrackAudioBucket` | 音源（`tracks/`）・アートワーク（`artworks/`）・プロフィール画像（`profiles/`） |

### 関連ファイル一覧

**インフラ定義**
- `api/template.yaml` — SAM テンプレート（Lambda関数・DynamoDB・S3・API Gatewayの定義）
- `api/package.json` — Lambda の依存関係（`@aws-sdk/client-dynamodb`, `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner`, `jsonwebtoken`, `bcryptjs`）

**Lambda ハンドラー**
- `api/lambda/s3.ts` — S3Client シングルトン
- `api/lambda/dynamo.ts` — DynamoDBDocumentClient シングルトン
- `api/lambda/get-track.ts` — トラック一覧取得（S3 Presigned GET URL を生成）
- `api/lambda/get-track-upload-url.ts` — S3 Presigned PUT URL 発行（音源・画像）
- `api/lambda/post-track.ts` — トラックメタデータ保存
- `api/lambda/put-track.ts` — トラックタイトル更新
- `api/lambda/delete-track.ts` — トラック削除（S3 + DynamoDB）
- `api/lambda/get-profile.ts` — プロフィール取得（S3 Presigned GET URL を生成）
- `api/lambda/put-profile.ts` — プロフィール更新（username・thumbnailKey）

**フロントエンド（hooks）**
- `src/hooks/useFetchTrack.ts` — トラック一覧取得（updatedAt 降順ソート）
- `src/hooks/useUploadTrack.ts` — ファイル選択 → ID3解析 → S3アップロード → メタデータ保存
- `src/hooks/useUpdateTrack.ts` — トラックタイトル更新
- `src/hooks/useDeleteTrack.ts` — トラック削除
- `src/hooks/useUpdateProfile.ts` — プロフィール画像選択 → S3アップロード → プロフィール更新

**ユーティリティ**
- `src/utils/readId3Artwork.ts` — ID3v2タグから APIC フレームを抽出してアートワークを data URI で返す（部分読み込みで最適化）

### S3 Presigned URL の使い方

アップロード時は `GET /data/track-upload-url?contentType=audio/mpeg` で PUT 用署名付き URL を取得し、直接 S3 にアップロードします：

```typescript
// 1. Presigned PUT URL を取得
const { uploadUrl, key } = await DefaultService.getDataTrackUploadUrl({ contentType: 'audio/mpeg' });

// 2. ファイルを Blob として取得して S3 に PUT（Lambda経由では不可）
const response = await fetch(localUri);
const blob = await response.blob();
await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'audio/mpeg' } });

// 3. key をメタデータとして保存
await DefaultService.postDataTrack({ requestBody: { title, s3Key: key, extention } });
```

取得時は `get-track.ts` Lambda が `s3Key` から Presigned GET URL を生成して返します。クライアントはその URL を直接 `Audio.Sound.createAsync()` に渡します。

### 新しいリソースを追加する手順

例：**新しいリソース "Playlist"** を追加する場合

1. **`api/template.yaml` を更新**
   - DynamoDB テーブルリソースを追加
   - 必要な Lambda 関数を追加（Handler, Policies, Events）
   - `Globals.Function.Environment.Variables` に新しいテーブル名を追加

2. **Lambda ハンドラーを作成** (`api/lambda/`)
   - CRUD の操作ごとにファイルを作成（get, post, put, delete）

3. **OpenAPI 定義を更新** (`src/data/*.ts` → `api/openapi.yaml`)
   ```bash
   yarn generate:openapi   # openapi.yaml と src/apiClient/ を再生成
   ```

4. **AWS にデプロイ**
   ```bash
   cd api && sam build && sam deploy
   ```

5. **フロントエンドの hook を作成** (`src/hooks/`)
   - `useFetch<Resource>.ts` — `DefaultService.get<Resource>()` を呼ぶ
   - `useCreate<Resource>.ts` / `useUpdate<Resource>.ts` / `useDelete<Resource>.ts`

### シードデータの更新

モックデータを変更して AWS に反映する場合：

```bash
# 1. モックデータを編集
src/data/tracks.ts     # トラック
src/data/memos.ts      # メモ
src/data/projects.ts   # プロジェクト
src/data/users.ts      # ユーザー

# 2. openapi.yaml と apiClient を再生成
yarn generate:openapi

# 3. Lambda をビルドして AWS にデプロイ
cd api && sam build && sam deploy
```

### 注意事項

- **`src/apiClient/` は自動生成のため手動編集不可**。変更は `src/data/*.ts` → `yarn generate:openapi` の順で行う
- **Email フィールドは読み取り専用**（GSI のパーティションキーのため変更不可）
- **シードデータ（legacySource / legacyArtwork）**: `s3Key` を持たない既存トラックは `legacySource`/`legacyArtwork` フィールドにフォールバックする
- **ファイルアップロードの mime タイプ**: `get-track-upload-url.ts` は `audio/mpeg`, `audio/wav`, `image/jpeg`, `image/png` のみ受け付ける
