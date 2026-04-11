# CLAUDE.md

このファイルは、リポジトリ内のコードを操作する際に Claude Code (claude.ai/code) へのガイダンスを提供します。

## コマンド

```bash
# 開発
yarn start                # Expo 開発サーバー起動 (localhost モック API)
yarn start:staging        # Expo 開発サーバー起動 (Staging DB に接続)
yarn ios                  # ネイティブビルド + iOS シミュレーター起動（初回・ネイティブ変更時のみ）
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

### 開発サーバーと iOS シミュレーター

日常の開発では `yarn start:staging`（または `yarn start`）のみ起動すれば十分です。
ターミナルで `i` を押すと iOS シミュレーターが開きます。

`yarn ios`（= `expo run:ios`）はネイティブコードをビルドするコマンドで、以下のタイミングでのみ必要です：

| タイミング | 理由 |
|-----------|------|
| **初回セットアップ** | シミュレーターにまだアプリがインストールされていない |
| **ネイティブモジュール追加後** | `expo install` で新パッケージを追加したとき |
| **`app.json` の変更後** | アプリ名・アイコン・権限など native config を変えたとき |
| **`expo-dev-client` の再ビルドが必要なとき** | ネイティブ層に変更が入ったとき |

一度 `yarn ios` でビルドしてシミュレーターにインストールしておけば、以降は JS レイヤーのみの変更であれば `yarn start:staging` → `i` だけで開発できます。

> **同時起動は不要。** `yarn start:staging` と `yarn ios` を同時に実行する必要はありません。

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

### AWS API Gateway

AWS Lambda + API Gateway の環境は **Staging** と **Production** の 2 つに分離されています。

| 環境 | スタック名 | Expo チャンネル | 用途 |
|------|-----------|----------------|------|
| Staging | `lyrics-mock-api` | `staging` | 開発・検証用。開発時は常にこちら |
| Production | `lyrics-prod-api` | `production` | リリース済みアプリ専用 |

- **Staging エンドポイント**: `https://wn0u6fu695.execute-api.ap-northeast-1.amazonaws.com/v1`
- **Production エンドポイント**: SAM デプロイ後に `sam deploy` の Outputs に表示される URL
- **リージョン**: `ap-northeast-1`（東京）
- **SAM テンプレート**: `api/template.yaml`（staging / production 共通）

`src/App.tsx` の起動時に `OpenAPI.BASE` を環境変数で設定しています：

```typescript
OpenAPI.BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
```

**環境変数ファイル:**
- `.env` — Staging の AWS URL を定義（git 管理対象）
- `.env.local` — ローカル開発時に localhost へ上書き（gitignore 済み）

**SAM デプロイ（手動）:**
```bash
# Staging
cd api && sam build && sam deploy --stack-name lyrics-mock-api

# Production（初回のみ --guided で対話設定、以降は明示的に指定）
cd api && sam build && sam deploy \
  --stack-name lyrics-prod-api \
  --resolve-s3 \
  --capabilities CAPABILITY_IAM \
  --parameter-overrides JwtSecret="<本番用の強いシークレット>"
```

**Production デプロイ後に行うこと:**
1. `sam deploy` の Outputs に表示される `ApiUrl` を GitHub Secrets の `EXPO_PUBLIC_API_BASE_URL_PROD` に設定する

**ツール要件:** AWS SAM CLI (`brew install aws-sam-cli`), esbuild (`npm install -g esbuild`)

### EAS ビルド（実機配布）

#### 概要

TestFlight 経由でテスター・面談相手にアプリを配布する場合は EAS Build を使います。

テスター側の手順はこれだけです（UDID 登録不要・不特定多数に配布可能）：
1. App Store で **TestFlight** をインストール（無料・初回のみ）
2. 開発者から届いた**招待リンク**をタップ
3. TestFlight 上で「インストール」をタップ

#### TestFlight 配布の全手順

**ステップ 1: ビルドを作成**
```bash
eas build --profile staging --platform ios
```

**ステップ 2: App Store Connect にアップロード**
```bash
eas submit --profile staging --platform ios
```
- Apple ID でのログインを求められる
- 完了すると App Store Connect の TestFlight にビルドが届く（5〜10分）

**ステップ 3: 外部テストグループを作成（App Store Connect）**
1. [App Store Connect](https://appstoreconnect.apple.com/apps/6762039606/testflight/ios) を開く
2. TestFlight タブ → 左サイドバー「外部テスト」の「+」
3. グループ名を入力（例: `ベータテスター`）
4. ビルドをグループに追加 → 「Apple の審査に提出」（**初回のみ**・数時間以内に完了）
5. 「設定」タブ → **「公開リンク」を有効化**

**ステップ 4: テスターに招待リンクを送る**
- 公開リンクを LINE やメールで送るだけ
- 審査は土日祝関係なく 24 時間対応（通常数時間以内）

> **注意:** 初回の外部テスト審査通過後は、以降のビルド更新に審査は不要。新しいビルドを `eas submit` してグループに追加するだけで自動配信される。

#### eas.json の配布方式

| プロファイル | distribution | 用途 |
|------------|-------------|------|
| `staging` | `store` | TestFlight 経由でテスター配布 |
| `production` | `store` | App Store リリース |
| `development` | `internal` | 開発者のみ（シミュレーター） |

> **注意:** `distribution: "internal"` は UDID 登録が必要で、テスターの操作が煩雑になるため、面談・外部テスターには `store`（TestFlight）を使用する。

#### App Store Connect アプリ情報

| 項目 | 値 |
|------|---|
| App Store Connect App ID | `6762039606` |
| Bundle ID | `com.yoshiydp.lyricsapp` |
| TestFlight URL | https://appstoreconnect.apple.com/apps/6762039606/testflight/ios |

#### EAS ビルドの注意点

**アーカイブサイズ**
- EAS はプロジェクト全体を圧縮してアップロードする
- `.easignore` で不要ファイルを除外しないとアップロードに時間がかかる（または失敗する）
- 除外対象: `node_modules`、`api`（Lambda コード）、`.aws-sam`（SAM ビルドキャッシュ）、`docs/` など
- `.easignore` を変更した場合は必ずコミットしてからビルドを実行する

**Yarn 4 (Berry) の認識**
- EAS Build サーバーはデフォルトで Yarn Classic を想定している
- このプロジェクトは Yarn 4.12.0 を使用しているため、`eas-build-pre-install.sh` で Corepack を有効化している
- `package.json` の `eas-build-pre-install` スクリプトも同様の役割（二重対策）
- `eas-build-pre-install.sh` は EAS がビルド前に自動実行するフックファイル（削除しないこと）

```bash
# eas-build-pre-install.sh の内容
corepack enable
corepack prepare yarn@4.12.0 --activate
```

**ビルド失敗時の確認手順**
1. `eas build:view <build-id>` でステータス確認
2. Expo ダッシュボード（https://expo.dev）でログを確認
3. `Install dependencies` フェーズで失敗している場合は Yarn バージョン不一致が疑われる
4. ローカルで `yarn install --immutable` を実行して lockfile が最新か確認する

**Apple Developer アカウント要件**
- Apple Developer Program（年間 $99）への登録が必要
- チーム ID: `GSAWY4TUK9`（Yoshihisa Watanabe Individual）
- Bundle ID: `com.yoshiydp.lyricsapp`
- EAS ビルド実行時に Apple ID でログインする（セッションは自動キャッシュされる）

---

### デプロイフロー

#### Staging へのデプロイ

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
  ↓ 両方通過 → EAS Update で Expo staging チャンネルへデプロイ（Staging DB）
```

**5. iPhone で確認**
- Expo Go を完全に終了して再起動
- 最新の update が自動適用される

**GitHub Actions の実行状況確認:**
- リポジトリの Actions タブ → `Deploy to Staging (EAS Update)`

**注意:** lint または test が失敗した場合はデプロイが中止されます。

#### Production へのデプロイ

staging ブランチへのマージ → 動作確認後、`master` にマージすると自動実行：

```
master へのマージを検知
  ↓ ESLint チェック
  ↓ Jest テスト
  ↓ 両方通過 → EAS Update で Expo production チャンネルへデプロイ（Production DB）
```

**GitHub Actions の実行状況確認:**
- リポジトリの Actions タブ → `Deploy to Production (EAS Update)`

#### スキーマ変更を Production へ反映（手動）

`api/template.yaml` に変更（テーブル追加・GSI 追加など）があった場合：

1. Staging で動作確認を完了させる
2. GitHub Actions タブ → `Sync Schema to Production` → `Run workflow`
3. 確認フォームに `yes` と入力して実行
4. Jest テスト通過後、Production の SAM スタック (`lyrics-prod-api`) へ自動デプロイ

**必要な GitHub Secrets（初回セットアップ時に設定）:**

| Secret 名 | 説明 |
|-----------|------|
| `EXPO_TOKEN_2` | EAS デプロイ用トークン |
| `EXPO_PUBLIC_API_BASE_URL` | Staging API Gateway URL |
| `EXPO_PUBLIC_API_BASE_URL_PROD` | Production API Gateway URL（初回 SAM デプロイ後に設定） |
| `AWS_ACCESS_KEY_ID` | スキーマ同期用 IAM アクセスキー |
| `AWS_SECRET_ACCESS_KEY` | スキーマ同期用 IAM シークレットキー |
| `JWT_SECRET_PROD` | Production 用 JWT シークレット |

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
| Records | `RecordsTable` | `recordId` |
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

*共通ユーティリティ*
- `api/lambda/s3.ts` — S3Client シングルトン
- `api/lambda/db.ts` — DynamoDBDocumentClient シングルトン
- `api/lambda/auth-middleware.ts` — JWT 認証ミドルウェア
- `api/lambda/utils.ts` — 共通ユーティリティ
- `api/lambda/ses.ts` — SES（メール送信）クライアント

*認証*
- `api/lambda/post-auth-login.ts` — ログイン（JWT 発行）
- `api/lambda/post-auth-logout.ts` — ログアウト
- `api/lambda/post-auth-register.ts` — ユーザー登録
- `api/lambda/post-auth-reset-password.ts` — パスワードリセット

*トラック*
- `api/lambda/get-track.ts` — トラック一覧取得（S3 Presigned GET URL を生成）
- `api/lambda/get-track-upload-url.ts` — S3 Presigned PUT URL 発行（音源・画像）
- `api/lambda/post-track.ts` — トラックメタデータ保存
- `api/lambda/put-track.ts` — トラック更新
- `api/lambda/delete-track.ts` — トラック削除（S3 + DynamoDB）

*プロジェクト*
- `api/lambda/get-project.ts` — プロジェクト一覧取得
- `api/lambda/get-project-detail.ts` — プロジェクト詳細取得
- `api/lambda/get-project-records.ts` — プロジェクトに紐づくレコード一覧取得
- `api/lambda/post-project.ts` — プロジェクト作成
- `api/lambda/put-project.ts` — プロジェクト更新
- `api/lambda/delete-project.ts` — プロジェクト削除

*レコード（録音）*
- `api/lambda/get-record.ts` — レコード一覧取得
- `api/lambda/get-record-upload-url.ts` — S3 Presigned PUT URL 発行（録音ファイル）
- `api/lambda/post-record.ts` — レコードメタデータ保存
- `api/lambda/put-record.ts` — レコード更新
- `api/lambda/delete-record.ts` — レコード削除（S3 + DynamoDB）

*メモ*
- `api/lambda/get-memo.ts` — メモ一覧取得
- `api/lambda/post-memo.ts` — メモ作成
- `api/lambda/put-memo.ts` — メモ更新
- `api/lambda/delete-memo.ts` — メモ削除

*プロフィール*
- `api/lambda/get-profile.ts` — プロフィール取得（S3 Presigned GET URL を生成）
- `api/lambda/put-profile.ts` — プロフィール更新（username・thumbnailKey）

**フロントエンド（hooks）**

*認証*
- `src/hooks/useGoogleAuth.ts` — Google OAuth 認証（expo-auth-session）

*トラック*
- `src/hooks/useFetchTrack.ts` — トラック一覧取得（updatedAt 降順ソート）
- `src/hooks/useUploadTrack.ts` — ファイル選択 → ID3解析 → S3アップロード → メタデータ保存
- `src/hooks/useUpdateTrack.ts` — トラック更新
- `src/hooks/useDeleteTrack.ts` — トラック削除

*プロジェクト*
- `src/hooks/useFetchProject.ts` — プロジェクト一覧取得
- `src/hooks/useFetchProjectDetail.ts` — プロジェクト詳細取得
- `src/hooks/useUpdateProject.ts` — プロジェクト更新
- `src/hooks/useDeleteProject.ts` — プロジェクト削除

*レコード（録音）*
- `src/hooks/useFetchRecord.ts` — レコード一覧取得
- `src/hooks/useFetchProjectRecords.ts` — プロジェクトに紐づくレコード一覧取得
- `src/hooks/useCreateRecord.ts` — レコード作成
- `src/hooks/useUploadProjectRecord.ts` — 録音ファイルを S3 にアップロード → プロジェクトに紐づけて保存
- `src/hooks/useUpdateRecord.ts` — レコード更新
- `src/hooks/useDeleteRecord.ts` — レコード削除

*メモ*
- `src/hooks/useFetchMemo.ts` — メモ一覧取得
- `src/hooks/useCreateMemo.ts` — メモ作成
- `src/hooks/useUpdateMemo.ts` — メモ更新
- `src/hooks/useDeleteMemo.ts` — メモ削除

*プロフィール*
- `src/hooks/useFetchProfile.ts` — プロフィール取得
- `src/hooks/useUpdateProfile.ts` — プロフィール画像選択 → S3アップロード → プロフィール更新

*UI / アニメーション*
- `src/hooks/useAnimatedSequence.ts` — 要素のフェードイン・スライドアニメーションを管理
- `src/hooks/useScreenAnimation.ts` — タイトル → リストの連続アニメーションをスクリーンレベルで管理

**ユーティリティ**
- `src/utils/authStorage.ts` — JWT トークン（アクセス/リフレッシュ）を SecureStore で永続化・取得・削除
- `src/utils/formatTime.ts` — ミリ秒を `m:ss` 形式の文字列に変換
- `src/utils/formatDate.ts` — Date を `YYYY.MM.DD` 形式の文字列に変換
- `src/utils/getFileExtension.ts` — ファイルパスから拡張子を取得
- `src/utils/getFileName.ts` — ファイルパスから拡張子なしのファイル名を取得
- `src/utils/readId3Artwork.ts` — ID3v2タグから APIC フレームを抽出してアートワークを data URI で返す（部分読み込みで最適化）
- `src/utils/generateWaveform.ts` — 音声ファイルから波形データ（バー配列）を生成
- `src/utils/pendingProjectSettings.ts` — ProjectSettingsScreen での変更を ProjectEditScreen へ受け渡すモジュールレベルキャッシュ
- `src/utils/pendingWaveformData.ts` — 生成済み波形データをプロジェクト ID をキーにモジュールレベルでキャッシュ
- `src/utils/recordingOptions.ts` — expo-av の高音質録音オプション定数（iOS / Android 対応）
- `src/utils/animations.ts` — バウンスなど汎用アニメーション関数（Animated.Value ベース）

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

4. **AWS Staging にデプロイ**
   ```bash
   cd api && sam build && sam deploy --stack-name lyrics-mock-api
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

# 3. Lambda をビルドして AWS Staging にデプロイ
cd api && sam build && sam deploy --stack-name lyrics-mock-api
```

### 注意事項

- **`src/apiClient/` は自動生成のため手動編集不可**。変更は `src/data/*.ts` → `yarn generate:openapi` の順で行う
- **Email フィールドは読み取り専用**（GSI のパーティションキーのため変更不可）
- **シードデータ（legacySource / legacyArtwork）**: `s3Key` を持たない既存トラックは `legacySource`/`legacyArtwork` フィールドにフォールバックする
- **ファイルアップロードの mime タイプ**: `get-track-upload-url.ts` は `audio/mpeg`, `audio/wav`, `image/jpeg`, `image/png` のみ受け付ける
