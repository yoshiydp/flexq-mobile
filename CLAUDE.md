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

### パスエイリアス

`@/` は `src/` に対応します。`tsconfig.json`、`babel.config.js` (module-resolver)、`jest.config.js` (moduleNameMapper) で設定されています。

### スタイリング

- グローバルカラーパレット: `src/globalStyles/colors.ts` (ゴールドアクセントのダークテーマ)
- コンポーネントスタイルは React Native の `StyleSheet.create()` を使用し、各コンポーネントと同じ場所に配置

### テスト

テストはソースファイルと同じ場所に配置します (`Component.tsx` の隣に `Component.test.tsx`)。`@testing-library/react-native` を使用。Expo モジュールとアイコンのモックは `__mocks__/` と `jest.setup.js` にあります。
