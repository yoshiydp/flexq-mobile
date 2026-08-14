# FlexQ

## アプリ概要

**FlexQ** は、音楽アーティストのためのモバイルアプリです。
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

**dev / staging / production の 3 環境構成**です。staging / production は運営者名義の AWS アカウント、dev は開発者アカウントで稼働します（2026-08-09 に旧 2 環境構成から移行。経緯は `docs/aws-account-migration-guide.md` を参照）。

| 環境       | AWS アカウント | SAM スタック名   | ブランチ  | Expo チャンネル | 用途                                                  |
| ---------- | -------------- | ---------------- | --------- | --------------- | ----------------------------------------------------- |
| dev        | 開発者         | `lyrics-dev-api` | `dev`     | `dev`           | 日常開発・実機確認・E2E                               |
| staging    | 運営者         | `flexq-stg-api`  | `develop` | `staging`       | リリース前検証（TestFlight / Play 内部テストの接続先） |
| production | 運営者         | `flexq-prod-api` | `master`  | `production`    | 本番                                                  |

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

日常の開発では `yarn start` を起動するだけで十分です（`.env` により開発側 dev 環境の AWS に接続されます）。

```bash
# dev 環境（AWS）に接続して起動（通常の開発）
yarn start
```

起動後、ターミナルで `i` を押すと iOS シミュレーター、`a` を押すと Android エミュレーターが開きます。

> **注意:** `yarn ios` / `yarn android`（ネイティブビルド）が必要なのは、初回セットアップ・ネイティブモジュール追加・`app.json` 変更後のみです。通常の JS 変更では `yarn start` のみで開発できます。

### DB への接続方法

| コマンド                                 | 接続先                              | 用途                 |
| ---------------------------------------- | ----------------------------------- | -------------------- |
| `yarn start`                             | dev 環境の AWS（`lyrics-dev-api`）  | 通常の開発・動作確認 |
| `yarn start`（`.env.local` で上書き時）  | ローカルモック API (localhost:3000) | オフライン開発       |

**環境変数ファイル:**

- `.env` — dev 環境の AWS URL を定義（git 管理対象）
- `.env.local` — ローカルモック API（localhost）で開発する場合に上書き（gitignore 済み）
- staging / production の URL は `.env` には置かず、`eas.json` の各ビルドプロファイルと GitHub Secrets で管理

### モック API の起動と確認

```bash
# モックサーバー起動
yarn mock:server

# Swagger UI でエンドポイントを確認
open http://localhost:3000
```

### 主要コマンド一覧

```bash
yarn start              # 開発サーバー起動（dev 環境の AWS に接続）
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

iOS シミュレーター・Android エミュレーターのどちらでも実行できます。
各フローは起動時に `clearState`（+ iOS は `clearKeychain`）でアプリ状態を初期化するため、**事前の手動ログアウトは不要**です。Expo Dev Client のランチャー画面（Development servers）や初回ダイアログが表示された場合も、共通ヘルパー（`.maestro/flows/helpers/launch-app.yaml`）が自動で処理します。

**1. 開発サーバーを起動（dev 環境に接続）**

```bash
yarn start
```

**2. シミュレーター / エミュレーターでアプリを開ける状態にする**

- iOS: ターミナルで `i` を押してシミュレーターを起動する
- Android: ターミナルで `a` を押してエミュレーターを起動する（`adb reverse tcp:8081` が自動設定され、`localhost:8081` で Metro に接続できる）

初回は `yarn ios` / `yarn android` で開発ビルド（expo-dev-client）のインストールが必要です。

**3. Maestro でテストを実行**

```bash
# 単一フローを実行
maestro test .maestro/flows/login.yaml

# すべてのフローを実行
maestro test .maestro/flows/

# デバイスが複数接続されている場合は明示的に指定（例: Android エミュレーター）
maestro --device emulator-5554 test .maestro/flows/
```

### テストアカウント（dev）

| 項目           | 値                 |
| -------------- | ------------------ |
| メールアドレス | `demo@example.com` |
| パスワード     | `password123`      |

**前提データ:** 一部のフローは demo アカウントの dev 環境データを前提とする（`project-detail` / `project-edit-save` / `project-delete` は 1 件以上のプロジェクト、`track-play` は 1 件以上のトラック）。プロジェクト名などの可変データはアサートせず、固定 UI 要素（id）でアサートする。

### フロー一覧

| ファイル                    | 内容                                     |
| --------------------------- | ---------------------------------------- |
| `.maestro/flows/login.yaml` | ログイン → PROJECT LIST 画面への遷移確認 |

### フロー作成時の注意点

- アプリの起動・ログインは共通ヘルパーを使う（起動のみ: `helpers/launch-app.yaml` / ログインまで: `helpers/login.yaml`）。アプリ状態の初期化と Expo Dev Client のランチャー処理を吸収している
- テキスト入力フィールドは**ラベルではなくプレースホルダーテキスト**を `tapOn` のターゲットにする
- `inputText` の入力値は **ASCII 文字のみ**にする（Android の Maestro は日本語など非 ASCII の入力をサポートしていない。`tapOn` / `assertVisible` での日本語テキストのマッチは可能）
- テキスト入力後は `helpers/hide-keyboard.yaml` を `runFlow` してキーボードを閉じてからボタンをタップする（iOS: `pressKey: Enter` / Android: `hideKeyboard` のプラットフォーム分岐）
- プラットフォーム固有の操作は `runFlow` の `when: platform: iOS` / `when: platform: Android` で分岐する
- `waitForAnimationToEnd` でログイン後の画面遷移アニメーションを待機する
- 画面タイトルがアニメーション用に分割されている場合（例: `PROJECT LIST`）は部分テキスト（`PROJECT`）で assertVisible する

---

## ブランチ運用

### ブランチ構成

| ブランチ    | 役割                                                                        |
| ----------- | --------------------------------------------------------------------------- |
| `master`    | Production リリース用。マージで production チャンネルへ配信（運営側 AWS）   |
| `develop`   | 開発の起点となるメインブランチ。マージで staging チャンネルへ配信（運営側 AWS） |
| `dev`       | 実機確認用のマージ専用ブランチ。マージで dev チャンネルへ配信（開発側 AWS） |
| `feature/*` | 機能開発用の作業ブランチ                                                    |
| `staging`   | レガシー（旧検証用ブランチ・廃止予定。新規 PR の base にしない）            |

### 開発フロー

```
feature/* ──PR──▶ dev（実機確認）
     │  確認 OK 後
     └────PR──▶ develop（staging 検証・テスター配布）──PR──▶ master（本番リリース）
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

**2. dev で実機確認**

- `feature/*` → `dev` へ PR を作成してマージ → dev チャンネルへ OTA 配信（開発側 AWS）
- 実機（Expo Go / 開発ビルド）で動作に問題がないことを確認する

**3. develop へ反映（staging 検証）**

- 同じ `feature/*` ブランチから `develop` へ PR を作成してマージ → staging チャンネルへ OTA 配信（運営側 AWS）
- TestFlight / Google Play 内部テストのビルドはこの環境に接続するため、テスター配布前の検証もここで行う

**4. リリース**

- `develop` → `master` へ PR を作成してマージ → production チャンネルへ OTA 配信（運営側 AWS）

> `dev` ブランチはリリース区切りごとに `develop` で強制リセットし、未マージ機能が溜まらないようにします。

### GitHub Actions による自動デプロイ

| トリガー                     | ワークフロー                      | 実行内容                                                      |
| ---------------------------- | --------------------------------- | ------------------------------------------------------------- |
| `dev` ブランチへのマージ     | Deploy to Dev (EAS Update)        | ESLint → Jest → EAS Update（dev チャンネル / 開発側 AWS）     |
| `develop` ブランチへのマージ | Deploy to Staging (EAS Update)    | ESLint → Jest → EAS Update（staging チャンネル / 運営側 AWS） |
| `master` ブランチへのマージ  | Deploy to Production (EAS Update) | ESLint → Jest → EAS Update（production チャンネル / 運営側 AWS） |

lint または test が失敗した場合はデプロイが中止されます。
Lambda（`api/` 配下）の変更は自動配信されないため、各環境へ手動で SAM デプロイします（CLAUDE.md「AWS API Gateway」参照）。

---

## 開発者自身が挙動確認する際の手順

### シミュレーターで確認（通常の開発）

```bash
# 1. 開発サーバーを起動（dev 環境に接続）
yarn start

# 2. ターミナルで i を押して iOS シミュレーターを開く
#    （Android の場合は a を押して Android エミュレーターを開く）
# → 変更は自動でホットリロードされる
```

### 実機（iPhone / Android）で確認

`dev` ブランチへのマージ（dev チャンネル）や `develop` へのマージ（staging チャンネル）で配信された OTA Update を実機で確認するには：

1. 実機で **Expo Go**（または開発ビルド）を完全に終了して再起動
2. 最新の update が自動適用される

EAS Update はプラットフォーム共通のため、各チャンネルの配信は iOS / Android 両方に届きます。

Android 実機でローカルの変更を直接確認する場合は、実機の「開発者向けオプション」で USB デバッグを有効化し、USB 接続して `yarn android` でインストールします。

### TestFlight で確認（テスターへの配布）

`staging` プロファイルのビルドは**運営側 staging 環境**（`flexq-stg-api`）に接続します（`eas.json` の `env` で API URL を固定済み）。

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
