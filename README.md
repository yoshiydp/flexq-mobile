# LYRICS

## アプリ概要

**LYRICS** は、音楽アーティストのためのモバイルアプリです。
リリック（歌詞）の作成から音源の取り込み・録音までを一体化した制作支援ツールとして開発されています。

- 音源をリアルタイムで再生しながらリリックを執筆可能
- 音楽プレイヤーのように再生シーケンスを自由に移動可能
- 思いついたフレーズやメロディをその場で録音・メモとして保存可能
- シンガー、ラッパー、ミュージシャンが直感的に扱えるシンプルな設計

手軽に「リリック × 録音 × 再生」を行える、創作支援アプリを目指しています。

---

## 開発中のデモ

<div align="center" style="display: flex; gap: 10px; justify-content: center;">
  <video src="https://github.com/user-attachments/assets/73e39b03-45b9-4b9d-85b2-e9fcd3b5b2f6"
         width="48%" autoplay loop muted playsinline></video>
  <video src="https://github.com/user-attachments/assets/2a49e83c-c177-47f4-9774-f4f98d5d1be0"
         width="48%" autoplay loop muted playsinline></video>
</div>

---

## 開発環境の技術選定・バージョン・使用ツール

### コア技術

| 項目         | バージョン / 内容 |
| ------------ | ----------------- |
| React Native | 0.81.5            |
| Expo SDK     | 54.0.0            |
| React        | 19.1.0            |
| TypeScript   | 5.9.3             |
| Node.js      | 20.11.0           |
| Yarn         | 4.12.0 (Berry)    |

### ナビゲーション

- **React Navigation** (Stack + Bottom Tabs) を採用（expo-router ではなく）
  - `@react-navigation/native` 7.x
  - `@react-navigation/stack` 7.x
  - `@react-navigation/bottom-tabs` 7.x

### 主要ライブラリ

| カテゴリ         | ライブラリ                                |
| ---------------- | ----------------------------------------- |
| 状態管理         | React Context (AuthContext, ModalContext) |
| 音声再生         | expo-av                                   |
| ファイル選択     | expo-document-picker                      |
| 画像選択         | expo-image-picker                         |
| アニメーション   | react-native-reanimated, moti             |
| 認証トークン保存 | @react-native-async-storage/async-storage |
| API クライアント | openapi-typescript-codegen (自動生成)     |

### 開発ツール

| ツール                        | 用途                                     |
| ----------------------------- | ---------------------------------------- |
| Jest + jest-expo              | ユニットテスト                           |
| @testing-library/react-native | コンポーネントテスト                     |
| Maestro                       | E2E テスト（画面操作フロー）             |
| ESLint (eslint-config-expo)   | 静的解析                                 |
| EAS Build / EAS Update        | 実機ビルド・OTA 配信                     |
| AWS SAM CLI                   | Lambda・DynamoDB・API Gateway のデプロイ |
| Swagger UI (Express)          | ローカルモック API の確認                |

---

## AWS の DB 環境と API 設計

### アーキテクチャ

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

音源・画像ファイルは S3 Presigned URL 経由で直接アップロード・取得します（Lambda の 6MB ペイロード制限回避）。

### 環境

| 環境       | SAM スタック名    | Expo チャンネル | エンドポイント                                                   |
| ---------- | ----------------- | --------------- | ---------------------------------------------------------------- |
| Staging    | `lyrics-mock-api` | `staging`       | `https://wn0u6fu695.execute-api.ap-northeast-1.amazonaws.com/v1` |
| Production | `lyrics-prod-api` | `production`    | SAM デプロイ後の Outputs に表示される URL                        |

リージョン: `ap-northeast-1`（東京）

### DynamoDB テーブル設計

全テーブルが複合キー構造 `PK=userId, SK=<resourceId>` を使用します。

| テーブル | SAM リソース名  | SK          |
| -------- | --------------- | ----------- |
| Tracks   | `TracksTable`   | `trackId`   |
| Memos    | `MemosTable`    | `memoId`    |
| Projects | `ProjectsTable` | `projectId` |
| Records  | `RecordsTable`  | `recordId`  |
| Users    | `UsersTable`    | `userId`    |

### S3 バケット

| バケット           | SAM リソース名     | 用途                                                                            |
| ------------------ | ------------------ | ------------------------------------------------------------------------------- |
| `TrackAudioBucket` | `TrackAudioBucket` | 音源（`tracks/`）・アートワーク（`artworks/`）・プロフィール画像（`profiles/`） |

---

## ローカルでの開発環境導入手順

### 前提条件

- Node.js 20.11.0
- Yarn 4.12.0（`corepack enable` で有効化）
- Xcode（iOS シミュレーター用）
- Android Studio（Android エミュレーター用。`brew install --cask android-studio` → Device Manager で AVD を作成）
- AWS SAM CLI（`brew install aws-sam-cli`）

### セットアップ

```bash
# 1. 依存パッケージのインストール
yarn install

# 2. (初回のみ) iOS シミュレーターへアプリをインストール
yarn ios

# 2'. (初回のみ・Android の場合) Android エミュレーターへアプリをインストール
yarn android
```

### 開発サーバーの起動

日常の開発では `yarn start:staging` を起動するだけで十分です。

```bash
# Staging DB に接続して起動（通常の開発）
yarn start:staging

# ローカルモック API に接続して起動
yarn start
```

起動後、ターミナルで `i` を押すと iOS シミュレーター、`a` を押すと Android エミュレーターが開きます。

> **注意:** `yarn ios` / `yarn android`（ネイティブビルド）が必要なのは、初回セットアップ・ネイティブモジュール追加・`app.json` 変更後のみです。通常の JS 変更では `yarn start:staging` のみで開発できます。

### DB への接続方法

| コマンド             | 接続先                              | 用途                 |
| -------------------- | ----------------------------------- | -------------------- |
| `yarn start:staging` | Staging AWS DynamoDB                | 通常の開発・動作確認 |
| `yarn start`         | ローカルモック API (localhost:3000) | オフライン開発       |

**環境変数ファイル:**

- `.env` — Staging の AWS URL を定義（git 管理対象）
- `.env.local` — ローカル開発時に localhost へ上書き（gitignore 済み）

### モック API の起動と確認

```bash
# モックサーバー起動
yarn mock:server

# Swagger UI でエンドポイントを確認
open http://localhost:3000
```

### 主要コマンド一覧

```bash
yarn start              # 開発サーバー起動（ローカルモック API）
yarn start:staging      # 開発サーバー起動（Staging DB）
yarn ios                # ネイティブビルド + iOS シミュレーター起動
yarn android            # Android エミュレーター
yarn lint               # ESLint 実行
yarn test               # Jest ウォッチモード
yarn test:ci            # Jest カバレッジ付き実行
yarn mock:server        # ローカルモック API サーバー起動
yarn generate:openapi   # API クライアント再生成
```

---

## E2Eテスト（Maestro）

画面操作レベルの E2E テストに [Maestro](https://maestro.mobile.dev/) を使用しています。フローは `.maestro/flows/` に YAML 形式で管理します。

### 前提条件

```bash
# Maestro CLI のインストール
curl -Ls "https://get.maestro.mobile.dev" | bash

# Java 17 以上が必要
brew install --cask temurin@17

# Maestro バージョン確認
maestro -v
```

### テストの実行方法

**1. 開発サーバーを起動（Staging DB に接続）**

```bash
yarn start:staging
```

**2. iOS シミュレーターでアプリを開く**

ターミナルで `i` を押してシミュレーターを起動し、アプリが表示された状態にする。

**3. Maestro でテストを実行**

```bash
# 単一フローを実行
maestro test .maestro/flows/login.yaml

# すべてのフローを実行
maestro test .maestro/flows/
```

### テストアカウント（Staging）

| 項目           | 値                 |
| -------------- | ------------------ |
| メールアドレス | `demo@example.com` |
| パスワード     | `password123`      |

### フロー一覧

| ファイル                    | 内容                                     |
| --------------------------- | ---------------------------------------- |
| `.maestro/flows/login.yaml` | ログイン → PROJECT LIST 画面への遷移確認 |

### フロー作成時の注意点

- テキスト入力フィールドは**ラベルではなくプレースホルダーテキスト**を `tapOn` のターゲットにする
- パスワード入力後は `pressKey: Enter` でキーボードを閉じてからボタンをタップする
- `waitForAnimationToEnd` でログイン後の画面遷移アニメーションを待機する
- 画面タイトルがアニメーション用に分割されている場合（例: `PROJECT LIST`）は部分テキスト（`PROJECT`）で assertVisible する

---

## ブランチ運用

### ブランチ構成

| ブランチ    | 役割                                              |
| ----------- | ------------------------------------------------- |
| `master`    | Production リリース用。マージで本番デプロイが走る |
| `staging`   | Staging 検証用。マージで Staging デプロイが走る   |
| `develop`   | 開発の起点となるメインブランチ                    |
| `feature/*` | 機能開発用の作業ブランチ                          |

### 開発フロー

```
feature/* → staging（挙動確認）
           ↓ 問題なければ
feature/* → develop → master
```

**1. feature ブランチで開発**

```bash
git checkout develop
git checkout -b feature/your-feature-name

# 変更・コミット・プッシュ
git add <files>
git commit -m "feat: your changes"
git push origin feature/your-feature-name
```

**2. staging で挙動確認**

- `feature/*` → `staging` へ PR を作成してマージ → Staging デプロイ
- Staging 環境で動作に問題がないことを確認する

**3. 問題なければ develop・master へマージ**

- `feature/*` → `develop` へ PR を作成してマージ
- `develop` → `master` へ PR を作成してマージ → Production デプロイ

### GitHub Actions による自動デプロイ

| トリガー                     | 実行内容                                            |
| ---------------------------- | --------------------------------------------------- |
| `staging` ブランチへのマージ | ESLint → Jest → EAS Update（staging チャンネル）    |
| `master` ブランチへのマージ  | ESLint → Jest → EAS Update（production チャンネル） |

lint または test が失敗した場合はデプロイが中止されます。

---

## 開発者自身が挙動確認する際の手順

### シミュレーターで確認（通常の開発）

```bash
# 1. 開発サーバーを起動（Staging DB に接続）
yarn start:staging

# 2. ターミナルで i を押して iOS シミュレーターを開く
#    （Android の場合は a を押して Android エミュレーターを開く）
# → 変更は自動でホットリロードされる
```

### 実機（iPhone / Android）で確認

Staging デプロイ済みの OTA Update を実機で確認するには：

1. 実機で **Expo Go**（または開発ビルド）を完全に終了して再起動
2. 最新の update が自動適用される

EAS Update はプラットフォーム共通のため、staging チャンネルの配信は iOS / Android 両方に届きます。

Android 実機でローカルの変更を直接確認する場合は、実機の「開発者向けオプション」で USB デバッグを有効化し、USB 接続して `yarn android` でインストールします。

### TestFlight で確認（テスターへの配布）

**ステップ 1: ビルドを作成**

```bash
eas build --profile staging --platform ios
```

**ステップ 2: App Store Connect にアップロード**

```bash
eas submit --profile staging --platform ios
```

完了すると App Store Connect の TestFlight にビルドが届きます（5〜10 分）。

**ステップ 3: 外部テストグループを作成（初回のみ）**

1. [App Store Connect → TestFlight](https://appstoreconnect.apple.com/apps/6762039606/testflight/ios) を開く
2. 左サイドバー「外部テスト」の横の **「+」** をクリック
3. グループ名を入力（例: `ベータテスター`）して作成
4. 「ビルドを追加」→ アップロードしたビルドを選択
5. **「Apple の審査に提出」** をクリック（数時間以内に完了）
6. グループの「設定」タブ → **「公開リンク」をオン** にする

> **初回のみ Apple の審査が必要です。** 審査通過後は以降のビルド更新に審査は不要で、`eas submit` するだけで自動配信されます。

**ステップ 4: テスターに招待リンクを送る**

公開リンクを LINE やメールで送るだけです。テスター側の操作：

1. App Store で **TestFlight** をインストール（無料・初回のみ）
2. 届いたリンクをタップ → 「承認」
3. TestFlight 上で「インストール」をタップ

### Google Play 内部テストで確認（Android テスターへの配布）

Android 版のテスター配布には Google Play Console の **内部テスト** トラック（TestFlight 相当・審査なし・最大 100 名）を使用します。

`eas.json` の Android ビルド（AAB）・submit（内部テストトラック）設定は整備済みです。

> **初回セットアップは完了済み（2026-07-26）。** Play Console のアプリ登録・サービスアカウント（`credentials/google-play-service-account.json`・gitignore 済み）・初回 AAB の手動アップロードまで実施済みのため、以降は下記の配布手順（= `/playstore`）だけで配信できます。

**配布手順（セットアップ完了後）:**

```bash
# 1. ビルド（AAB）
eas build --profile staging --platform android

# 2. Play Console 内部テストトラックへアップロード
eas submit --profile staging --platform android
```

**テスターへの配布:**

1. Play Console → テスト → 内部テスト → 「テスター」タブでテスターの Google アカウントを追加
2. 「リンクをコピー」で参加 URL を取得して LINE やメールで送る
3. テスターはリンクを開いて「参加」→ Play ストアからインストール（専用アプリ不要）

詳細な初回セットアップ手順は CLAUDE.md の「Google Play 内部テスト配信」を参照してください。

### トラブルシューティング

**モジュール解決エラー（Unable to resolve module）発生時**

```bash
rm -rf node_modules .expo
yarn cache clean
yarn install
yarn start -c
```

**EAS ビルド失敗時の確認手順**

1. `eas build:view <build-id>` でステータス確認
2. [Expo ダッシュボード](https://expo.dev) でログを確認
3. `Install dependencies` フェーズで失敗している場合は Yarn バージョン不一致が疑われる
4. ローカルで `yarn install --immutable` を実行して lockfile が最新か確認する

**`eas submit` でビルド番号の重複エラーが出る場合**

```
Increment Build Number: Build number X for app version 1.0.0 has already been used.
```

`eas.json` の該当プロファイルに `autoIncrement: true` を追加してから再ビルドしてください：

```json
"staging": {
  "autoIncrement": true,
  ...
}
```

**`eas-cli` のバージョン警告が出る場合**

```
★ eas-cli@x.x.x is now available.
```

古いバージョンのままだと submit 時に予期せぬエラーが起きることがあります。定期的にアップデートしてください：

```bash
npm install -g eas-cli
```
