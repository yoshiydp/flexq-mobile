# CLAUDE.md

このファイルは、リポジトリ内のコードを操作する際に Claude Code (claude.ai/code) へのガイダンスを提供します。

## コマンド

```bash
# 開発
yarn start                # Expo 開発サーバー起動 (.env の dev 環境 AWS に接続)
                          # ローカルモック API に繋ぐ場合は .env.local で localhost に上書き
yarn ios                  # ネイティブビルド + iOS シミュレーター起動（初回・ネイティブ変更時のみ）
yarn android              # Android エミュレーター

# Lint & フォーマット
yarn lint                 # expo lint (CI では --max-warnings=0)

# テスト (Jest)
yarn test                 # Jest ウォッチモード
yarn test:ci              # Jest カバレッジ付き実行 (CI)

# 単一テストファイルの実行
yarn test src/components/ui/buttons/ArrowButton/ArrowButton.test.tsx

# E2E テスト (Maestro) ※ yarn start (dev 環境) + iOS シミュレーター起動が前提
maestro test .maestro/flows/login.yaml   # ログインフロー
maestro test .maestro/flows/             # 全フロー実行

# モック API サーバー (Swagger UI: http://localhost:3000)
yarn mock:server

# API クライアント生成 (api/openapi.yaml から src/apiClient/ を再生成)
yarn openapi --input api/openapi.yaml --output src/apiClient

# API Gateway 用 OpenAPI 定義の生成 (src/data/ から api/openapi-aws.yaml を生成)
yarn generate:openapi

# AWS SAM (api/ ディレクトリで実行。--stack-name は必ず明示する)
cd api
sam build                                                      # Lambda 関数をビルド
sam deploy --stack-name lyrics-dev-api --no-confirm-changeset  # dev 環境へデプロイ（開発者アカウント）
# staging / production（運営者アカウント）へのデプロイは「AWS API Gateway」の項を参照
```

## アーキテクチャ

### 開発サーバーと iOS シミュレーター

日常の開発では `yarn start` のみ起動すれば十分です（`.env` により開発側 dev 環境の AWS に接続されます）。
ターミナルで `i` を押すと iOS シミュレーターが開きます。

`yarn ios`（= `expo run:ios`）はネイティブコードをビルドするコマンドで、以下のタイミングでのみ必要です：

| タイミング | 理由 |
|-----------|------|
| **初回セットアップ** | シミュレーターにまだアプリがインストールされていない |
| **ネイティブモジュール追加後** | `expo install` で新パッケージを追加したとき |
| **`app.json` の変更後** | アプリ名・アイコン・権限など native config を変えたとき |
| **`expo-dev-client` の再ビルドが必要なとき** | ネイティブ層に変更が入ったとき |

一度 `yarn ios` でビルドしてシミュレーターにインストールしておけば、以降は JS レイヤーのみの変更であれば `yarn start` → `i` だけで開発できます。

> **同時起動は不要。** `yarn start` と `yarn ios` を同時に実行する必要はありません。

### Android エミュレーター・実機での開発とテスト

iOS と同様、日常の開発は `yarn start` を起動し、ターミナルで `a` を押すと Android エミュレーターでアプリが開きます。

**前提条件（初回のみ）:**

1. Android Studio をインストール（`brew install --cask android-studio`）
2. Android Studio → Device Manager で AVD（仮想デバイス）を作成（例: Pixel 8 / 最新 API）
3. 環境変数を設定（`~/.zshrc` に追記）:
   ```bash
   export ANDROID_HOME=$HOME/Library/Android/sdk
   export PATH=$PATH:$ANDROID_HOME/emulator:$ANDROID_HOME/platform-tools
   ```
4. `yarn android`（= `expo run:android`）で初回ネイティブビルド + エミュレーターへインストール

`yarn android` が必要になるタイミングは iOS の `yarn ios` と同じです（初回セットアップ・ネイティブモジュール追加後・`app.json` 変更後・`expo-dev-client` 再ビルド時）。以降 JS レイヤーのみの変更であれば `yarn start` → `a` だけで開発できます。

**Android 実機でのローカル確認:**

1. 実機の「開発者向けオプション」で **USB デバッグ** を有効化
2. USB 接続して `adb devices` で認識されることを確認
3. `yarn android` でビルド + インストール（以降は開発サーバー接続のみで OK）

**OTA Update の確認:**

`dev` ブランチへのマージで dev チャンネル、`develop` へのマージで staging チャンネルに GitHub Actions が EAS Update を配信します。配信はプラットフォーム共通のため、Android にも同じチャンネルで届きます。Android 実機側でアプリ（開発ビルド / Expo Go）を完全終了 → 再起動すると最新 update が適用されます。

> **Android のセットアップ状況:** Google ログイン（TASK-54）・Google Play Console・EAS submit・内部テスト配信まですべてセットアップ済みで運用可能。Google OAuth の Android クライアントは lyrics-app-492415 にデバッグ署名 / EAS アップロード鍵 / Play アプリ署名鍵の 3 つを登録済み（`EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` は `.env` に設定済み）。**新規 Android クライアント作成時は「詳細設定 → カスタム URI スキームを有効にする」を ON にすること**（デフォルト無効のままだと OAuth が `400: invalid_request` になる）。

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
1. `api/openapi.yaml`（手動管理の OpenAPI 定義）を編集
2. `yarn openapi --input api/openapi.yaml --output src/apiClient` を実行して `src/apiClient/` を再生成

なお `yarn generate:openapi` は `src/data/*.ts` と `api/templates/base.yaml` から **API Gateway 用の `api/openapi-aws.yaml` / `.json` を生成する別コマンド**で、`api/openapi.yaml` や `src/apiClient/` には影響しません。

モックサーバー (`yarn mock:server`) は `src/data/*.ts` のデータを Express でローカルに配信します。

### AWS API Gateway

AWS Lambda + API Gateway は **dev / staging / production の 3 環境**に分離されています。
staging / production は**運営者名義の AWS アカウント**、dev は開発者アカウントで稼働します
（2026-08-09 に旧 2 環境構成〈`lyrics-mock-api` / `lyrics-prod-api`〉から移行。経緯・手順は `docs/aws-account-migration-guide.md` 参照）。

| 環境 | AWS アカウント | スタック名 | ブランチ | Expo チャンネル | 用途 |
|------|--------------|-----------|---------|----------------|------|
| dev | 開発者 | `lyrics-dev-api` | `dev` | `dev` | 日常開発・実機確認・E2E。開発時は常にこちら |
| staging | 運営者 | `flexq-stg-api` | `develop` | `staging` | リリース前検証。TestFlight / Play 内部テストのビルドもここを向く |
| production | 運営者 | `flexq-prod-api` | `master` | `production` | 本番（リリース済みアプリ専用） |

- **dev エンドポイント**: `https://e02397anue.execute-api.ap-northeast-1.amazonaws.com/v1`（`.env` に設定済み）
- **staging エンドポイント**: `https://5pzt12icve.execute-api.ap-northeast-1.amazonaws.com/v1`（`eas.json` の staging プロファイルに設定済み）
- **production エンドポイント**: `https://7ez5duggcc.execute-api.ap-northeast-1.amazonaws.com/v1`（`eas.json` の production プロファイルに設定済み）
- **リージョン**: `ap-northeast-1`（東京）
- **SAM テンプレート**: `api/template.yaml`（3 環境共通）
- 旧スタック（`lyrics-mock-api` / `lyrics-prod-api`）は切り戻し用に一時温存中。安定稼働の確認後に削除する（`docs/aws-account-migration-guide.md` 第 IV 部）

`src/App.tsx` の起動時に `OpenAPI.BASE` を環境変数で設定しています：

```typescript
OpenAPI.BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
```

**環境変数ファイル:**
- `.env` — dev 環境の AWS URL を定義（git 管理対象）
- `.env.local` — ローカルモック API（localhost）で開発する場合に上書き（gitignore 済み）
- staging / production の URL は `.env` には置かず、`eas.json` の各ビルドプロファイルの `env` と GitHub Secrets で管理する（TestFlight / Play ビルドの初回起動が dev API を向かないようにするため）

**SAM デプロイ（手動）:**

運営者アカウントへのデプロイは、運営者から受け取った CI 用 IAM ユーザー `flexq-deploy` のキーを
`aws configure --profile flexq-ops` で登録して使う。

```bash
# dev（開発者アカウント・デフォルトプロファイル）
cd api && sam build && sam deploy --stack-name lyrics-dev-api --no-confirm-changeset

# staging（運営者アカウント）
cd api && sam build && AWS_PROFILE=flexq-ops sam deploy --stack-name flexq-stg-api \
  --region ap-northeast-1 --resolve-s3 --capabilities CAPABILITY_IAM --no-confirm-changeset

# production（運営者アカウント）
cd api && sam build && AWS_PROFILE=flexq-ops sam deploy --stack-name flexq-prod-api \
  --region ap-northeast-1 --resolve-s3 --capabilities CAPABILITY_IAM --no-confirm-changeset
```

> **注意:** `api/samconfig.toml` のデフォルトスタック名は dev の `lyrics-dev-api`（`--stack-name` なしの `sam deploy` は dev に向く）。**staging / production へのデプロイでは `--stack-name` と `AWS_PROFILE=flexq-ops` を必ず明示する**。また `confirm_changeset = true` のため、非対話実行では `--no-confirm-changeset` が必須。

- `JwtSecret` / `SenderEmail` などの設定済みパラメータは、**既存スタックの更新時のみ**未指定でも CloudFormation が前回値を保持する（新規作成時はテンプレートの `Default` が入る。下記「Replicate トークン」の注意も参照）

**ツール要件:** AWS SAM CLI (`brew install aws-sam-cli`), esbuild (`npm install -g esbuild`)

### AI クリーンアップ（Replicate 連携）

#### 概要

録音データから声（ボーカル）だけを抽出する機能（TASK-38/41/42 で構築）。処理は外部 AI API の [Replicate](https://replicate.com) でサーバーサイド非同期実行する。

```
RecordPlayer「AI クリーンアップ」
  → POST /data/record/{id}/separate        (post-record-separate.ts)
      Replicate に prediction を作成 → separationStatus: processing
  → アプリが GET /data/record/{id}/separate-status をポーリング
      (get-record-separate-status.ts が Replicate を確認し、完了時に
       出力音源を S3 records/separated/ に保存 → done)
  →「元の録音 / 声のみ」を切替再生（元データは常に保持）
```

- 実行トリガー: 録音前の「AI クリーンアップ」トグル（自動実行・AsyncStorage に記憶）と、再生画面の手動ボタンの 2 系統
- 処理タイプは録音時のイヤホン接続状態（`recordedWithHeadphones`）から自動選択: イヤホンなし → separate（トラックかぶり分離）/ あり → denoise（ノイズ除去）

#### モデル構成

| 用途 | SAM パラメータ | デフォルト |
|------|--------------|-----------|
| separate | `ReplicateSeparateModel` | `ryan5453/demucs`（stem: vocals / output_format: wav） |
| denoise | `ReplicateDenoiseModel` | `ryan5453/demucs`（ボーカル抽出で代用） |

**モデル選定の経緯・制約（変更時は必ず確認）:**
- **コミュニティモデルは「最新バージョン実行」エンドポイント（`POST /v1/models/{owner}/{name}/predictions`）が 404 になる**（公式モデル専用）。`replicate.ts` は `latest_version.id` を解決して `POST /v1/predictions` で作成する
- **出力形式は wav 固定 + Lambda 側で位置合わせ（TASK-44。変更しないこと）**: demucs は入力 m4a の AAC priming（先頭無音 2112 サンプル ≈48ms）を含めてデコードするため、mp3/flac/wav のどれを選んでも出力の頭に無音が残り、トラックとの同時再生で声が一定時間遅れる。wav で受けて保存時に `audio-align.ts` が「出力の長さ − 元録音の長さ」を先頭からトリムし、16-bit PCM 化（サイズは 24-bit flac と同程度）して保存する。位置合わせ済みレコードには `separationAligned: true` が付き、フラグのない古い分離音源（mp3 / flac 移行期）は API が未処理（none）として返すので「AI クリーンアップ」ボタンから再生成できる（完了時に旧ファイルは削除される）
- 本来の denoise 候補だった `resemble-enhance` は **m4a コンテナ自体を読めない**（wav / mp3 / flac のみ）ため demucs で代用中。専用モデルに戻す場合は `ReplicateDenoiseModel` を差し替える（`inputFor` がモデル名で入力スキーマを切り替える）
- **iOS 録音は AAC 必須**: `src/utils/recordingOptions.ts` の `outputFormat: Audio.IOSOutputFormat.MPEG4AAC` を削除しないこと。未指定だと PCM-in-M4A という特殊形式になり全モデルが読めず、ファイルサイズも約 5 倍になる（TASK-42 で修正）。**AAC 化以前の録音は AI クリーンアップ不可**（failed 遷移 → 再実行可能）

#### Replicate アカウント・トークンのセットアップ

1. [replicate.com](https://replicate.com) でアカウント作成
2. Account settings > [API tokens](https://replicate.com/account/api-tokens) で**用途別の名前付きトークン**を作成（例: `lyrics-mobile`。Default は温存し、ローテーションしやすくする）
3. [Billing](https://replicate.com/account/billing) でクレジットをプリペイド購入（$5〜10）。**auto-reload は OFF** にして残高を実質の支出上限として使う
4. 注意: 残高 $5 未満の間は prediction 作成が 6 回/分にレート制限される（一時エラーとしてリトライされるため実害は小さい）

#### SAM パラメータの設定（デプロイ）

```bash
# staging（運営者アカウント）
cd api && sam build && AWS_PROFILE=flexq-ops sam deploy --stack-name flexq-stg-api \
  --region ap-northeast-1 --resolve-s3 --capabilities CAPABILITY_IAM --no-confirm-changeset \
  --parameter-overrides ReplicateApiToken="<トークン>"

# production（運営者アカウント）
cd api && sam build && AWS_PROFILE=flexq-ops sam deploy --stack-name flexq-prod-api \
  --region ap-northeast-1 --resolve-s3 --capabilities CAPABILITY_IAM --no-confirm-changeset \
  --parameter-overrides ReplicateApiToken="<トークン>"

# dev（開発者アカウント。dev で AI クリーンアップを使う場合のみ）
cd api && sam build && sam deploy --stack-name lyrics-dev-api --no-confirm-changeset \
  --parameter-overrides ReplicateApiToken="<トークン>"
```

- Replicate のトークン・費用は**当面開発側負担**（運営者アカウントの stg / prod への設定も開発者が行う。`docs/aws-account-migration-guide.md` 第 III 部 7）
- `ReplicateApiToken` は NoEcho（CloudFormation コンソールに表示されない）。**未設定の間は分離エンドポイントが 503 を返す**が、他機能には影響しない
- 一度設定した値は以後の未指定デプロイでも保持される（CloudFormation の UsePreviousValue）。ただし確実を期すなら毎回明示指定する
- **⚠️ UsePreviousValue が効くのは「既存スタックの更新」だけ。スタックを新規作成した場合は `Default` の空文字が入り、AI クリーンアップが 503 になる**（TASK-88: 運営者アカウントへの移行で新設した `lyrics-dev-api` / `flexq-stg-api` / `flexq-prod-api` の 3 スタックとも空のままで、TestFlight / Play 内部テストの AI クリーンアップが全滅していた）
- デプロイ後は環境変数が空でないことを確認する（`/deploy-api-dev` / `/deploy-api-stg` の手順 5 のスモークチェック）:

```bash
FN=$(aws lambda list-functions --region ap-northeast-1 \
  --query "Functions[?starts_with(FunctionName,'lyrics-dev-api-PostRecordSeparateFunction')].FunctionName" --output text)
aws lambda get-function-configuration --function-name "$FN" --region ap-northeast-1 \
  --query "Environment.Variables.REPLICATE_API_TOKEN" --output text | wc -c   # 1 なら空 = 未設定
```
- トークンをローテーションした場合は staging / production（利用していれば dev も）へ再デプロイで反映する

#### コスト

- 従量課金（プリペイドクレジットから消費）。demucs は GPU 実行数秒〜十数秒で **1 回あたり数円程度**（実測: 8.7 秒の音源で処理 17 秒）
- アプリ側の課金ガード: 実行はユーザーのオプトインのみ・処理済みレコードの再実行はキャッシュ（`separatedS3Key`）を返して二重課金を防止

#### クライアント側の再生（ローカルキャッシュ / TASK-89）

- 分離音源（声のみ）は 16-bit PCM wav（約 1.4 Mbps・元録音 m4a の 5 倍超）のため、Presigned URL をそのまま `Audio.Sound` に渡す**ストリーミング再生では冒頭の再バッファリングで音が途切れ（カクつき）、その間に録音側の再生位置だけが止まってトラック同時再生が 0.2〜0.3 秒ズレる**（補正ウィンドウの外で起きるため残る）。ファイル自体は元録音と相互相関で 0.00 ms 一致しており、サーバー側の位置合わせ（TASK-44）の問題ではない
- そのため「声のみ」への切替時に `src/utils/recordAudioCache.ts` でキャッシュディレクトリ（`record-audio/`）へダウンロードしてからローカルファイルとして再生する（切替中はフルスクリーンローディング）。2 回目以降はキャッシュから即再生。鮮度は Presigned URL の ETag（`Range: bytes=0-0` の GET で取得。HEAD は署名不一致で 403）で判定し、再実行で上書きされた音源は作り直す。ダウンロード失敗時は従来のストリーミング再生にフォールバックする
- iOS の発音開始タイミング補正（`useSyncedTrackPlayback.correctSyncOffset`）のウィンドウは 150ms × 8 回（1.2 秒）
- Metro 接続の開発ビルド（`__DEV__`）では再生画面の下部に `source=… sync=… offset=…` の可視化テキスト（`sync-offset-debug`）を表示する。`offset` はトラック位置 −（開始位置 + 録音位置）の実測値（正 = 声が遅れて聞こえる）。E2E `.maestro/flows/13-sync-playback/SY-05-separated-timing.yaml` はこの値が ±39ms 以内であることを検証する

#### トラブルシューティング

| 症状 | 原因 / 確認先 |
|------|--------------|
| 実行時に 503 | `ReplicateApiToken` 未設定（SAM パラメータを確認） |
| 声のみの同時再生がズレる・冒頭がカクつく | 分離音源がローカルキャッシュではなくストリーミング再生されている（開発ビルドの `sync-offset-debug` が `separated:remote` になる = ダウンロード失敗。端末の空き容量・Presigned URL の期限切れを確認）。`separated:local` でズレる場合は `offset` の値と `useSyncedTrackPlayback` の補正ログを確認する |
| 開始直後に 502 | `PostRecordSeparateFunction` の CloudWatch ログ（Replicate API エラーの詳細が出る） |
| failed になる | [Replicate ダッシュボード](https://replicate.com)の prediction ログ。AAC 化以前の録音（PCM-in-M4A）は読めず failed になる（仕様） |
| processing のまま進まない | 一時エラーはポーリングごとにリトライされ、連続 5 回失敗で failed に落ちる。`GetRecordSeparateStatusFunction` の CloudWatch ログを確認 |

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
- `staging` プロファイルのビルドは**運営側 staging 環境**（`flexq-stg-api`）に接続する（`eas.json` の `env` で API URL を固定済み。`.env` の dev URL は使われない）

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

#### Google Play 内部テスト配信（Android の TestFlight 相当）

Android のテスター配布は Google Play Console の **内部テスト** トラックを使います（審査なし・最大 100 名・アップロード後数分で配信）。より広い範囲でのテストが必要になったら「クローズドテスト」（初回審査あり）へ昇格します。

`eas.json` の Android ビルド・submit 設定は整備済みです（TASK-60）：

| プロファイル | ビルド | submit 先 |
|------------|-------|-----------|
| `development` | APK（developmentClient） | — |
| `staging` | AAB | 内部テストトラック（`track: "internal"`） |
| `production` | AAB | 内部テストトラック（当面。リリース段階でクローズドテスト → 製品版トラックへ昇格する） |

> **初回セットアップは完了済み（2026-07-26）。** Play Console のアプリ登録・サービスアカウント・初回 AAB 手動アップロード（versionCode 4）まで実施済みのため、以降は「配布手順」の `eas build` → `eas submit`（= `/playstore`）だけで配信できる。

**初回セットアップの記録（別アカウントで再構築する場合の手順）:**
1. [Google Play Console](https://play.google.com/console) のデベロッパーアカウントを登録（$25 買い切り。電話番号は `+81` + 先頭 0 なしの国際形式）
2. Play Console でアプリを作成（パッケージ名 `com.yoshiydp.lyricsapp`。**パッケージ名は最初にアップロードした AAB で確定し変更不可**）
3. Google Cloud（`lyrics-app-492415`・iOS OAuth と同じプロジェクト）でサービスアカウント `play-publisher@lyrics-app-492415.iam.gserviceaccount.com` を作成して JSON キーを発行し、**Play Console の「ユーザーと権限」から通常ユーザーと同様に招待**して「Lyrics App」への リリース権限を付与する（旧「API アクセス」ページは廃止済み）。あわせて Google Cloud 側で **Google Play Android Developer API を有効化**する（未有効だと `eas submit` が PERMISSION_DENIED になる）
4. JSON キーをリポジトリ直下の `credentials/google-play-service-account.json` に配置する（`credentials/` は gitignore / easignore 済み。**絶対にコミットしないこと**）
5. **最初の 1 本目の AAB のみ Play Console の画面から手動アップロードが必要**（以降は `eas submit` で自動化できる）。新規アプリの初回公開はストア反映まで 30 分〜数時間かかる

> **補足:** アプリ情報（ストア掲載情報など）の設定が未完了の状態で `eas submit` が失敗する場合は、`releaseStatus: "draft"` を一時的に `submit.<profile>.android` へ追加してドラフトとして提出できる。セットアップ完了後は削除してよい（デフォルトは即時公開の `completed`）。

**配布手順（セットアップ完了後）:**
```bash
# 1. ビルド（AAB）
eas build --profile staging --platform android

# 2. Play Console 内部テストトラックへアップロード
eas submit --profile staging --platform android
```

**テスターへの配布:**
1. Play Console → テスト → 内部テスト → 「テスター」タブでテスターの Google アカウント（メールアドレス）をリストに追加
2. 「リンクをコピー」で参加 URL を取得し、LINE やメールで送る
3. テスターはリンクを開いて「参加」→ Play ストアからインストール（TestFlight のような専用アプリは不要）

> **代替手段:** Play Console を経由せず配布したい場合は **Firebase App Distribution**（APK 配布・審査なし）も利用できる。ただしテスター側にインストール用アプリ（App Tester）の導入が必要になるため、基本は Play 内部テストを使う。

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

ブランチへのマージをトリガーに、GitHub Actions（ESLint → Jest → EAS Update）が各チャンネルへ OTA 配信します。lint または test が失敗した場合は配信が中止されます。

```
feature/TASK-X ──PR──▶ dev ──────▶ EAS Update: dev チャンネル（開発側 AWS: lyrics-dev-api）
      │  実機確認 OK 後
      └────────PR──▶ develop ────▶ EAS Update: staging チャンネル（運営側 AWS: flexq-stg-api）
                        │  検証 OK 後
                        └──PR──▶ master ▶ EAS Update: production チャンネル（運営側 AWS: flexq-prod-api）
```

- `dev` ブランチはマージ専用の実機確認場所。リリース区切りごとに `develop` で強制リセットして未マージ機能の滓を溜めない
- 旧 `staging` ブランチは削除済み（2026-08-14）。ブランチは `dev` / `develop` / `master` の 3 本のみ

#### dev への配信（日常の実機確認）

1. feature ブランチから `dev` への PR を作成・マージ
2. ワークフロー `Deploy to Dev (EAS Update)` が dev チャンネルへ配信（API URL は Secrets の `EXPO_PUBLIC_API_BASE_URL_DEV`）
3. 実機でアプリ（開発ビルド / Expo Go）を完全終了 → 再起動すると最新 update が適用される
4. Lambda（`api/` 配下）に変更がある場合は、あわせて `lyrics-dev-api` へ手動 SAM デプロイ（`/deploy-api-dev`）

#### staging への配信（リリース前検証）

1. dev で実機確認が済んだ feature ブランチから `develop` への PR を作成・マージ（`/task-done` が Notion 更新とあわせて自動化）
2. ワークフロー `Deploy to Staging (EAS Update)` が staging チャンネルへ配信（API URL は Secrets の `EXPO_PUBLIC_API_BASE_URL` = 運営側 stg）
3. TestFlight / Google Play 内部テストのビルド（`--profile staging`）もこの環境に接続する
4. Lambda 変更がある場合は `flexq-stg-api` へ手動 SAM デプロイ（`/deploy-api-stg`・`AWS_PROFILE=flexq-ops`）

#### production への配信（リリース）

1. `develop` から `master` への PR を作成・マージ（`/pr-master`）
2. ワークフロー `Deploy to Production (EAS Update)` が production チャンネルへ配信（API URL は Secrets の `EXPO_PUBLIC_API_BASE_URL_PROD` = 運営側 prod）
3. Lambda 変更がある場合は `flexq-prod-api` へ手動 SAM デプロイ（`AWS_PROFILE=flexq-ops`）

#### スキーマ変更（api/template.yaml）の反映

テーブル追加・GSI 追加などのスキーマ変更は、**dev → staging → production の順に手動 SAM デプロイで昇格**させる（コマンドは「AWS API Gateway」の「SAM デプロイ（手動）」参照）。各段階で動作確認を済ませてから次の環境へ進める。

> 旧 `Sync Schema to Production` ワークフローは旧アカウント（`lyrics-prod-api`）向けだったため廃止済み（TASK-77）。スキーマ反映は上記の手動 SAM デプロイのみで行う。

**GitHub Secrets（現行）:**

| Secret 名 | 説明 |
|-----------|------|
| `EXPO_TOKEN_2` | EAS デプロイ用トークン |
| `EXPO_PUBLIC_API_BASE_URL_DEV` | dev API Gateway URL（開発側 `lyrics-dev-api`） |
| `EXPO_PUBLIC_API_BASE_URL` | staging API Gateway URL（運営側 `flexq-stg-api`） |
| `EXPO_PUBLIC_API_BASE_URL_PROD` | production API Gateway URL（運営側 `flexq-prod-api`） |
| `JWT_SECRET_PROD` | production 用 JWT シークレット（運営側 prod の値と一致させる） |
| `AWS_ACCESS_KEY_ID_OPS` / `AWS_SECRET_ACCESS_KEY_OPS` | 運営者アカウントの `flexq-deploy` キー（現在どのワークフローからも未使用。CI から SAM デプロイする場合に使う） |

### パスエイリアス

`@/` は `src/` に対応します。`tsconfig.json`、`babel.config.js` (module-resolver)、`jest.config.js` (moduleNameMapper) で設定されています。

### スタイリング

- グローバルカラーパレット: `src/globalStyles/colors.ts` (ゴールドアクセントのダークテーマ)
- コンポーネントスタイルは React Native の `StyleSheet.create()` を使用し、各コンポーネントと同じ場所に配置

### テスト

テストはソースファイルと同じ場所に配置します (`Component.tsx` の隣に `Component.test.tsx`)。`@testing-library/react-native` を使用。Expo モジュールとアイコンのモックは `__mocks__/` と `jest.setup.js` にあります。

### E2E テスト（Maestro）

E2E テストのフローは `.maestro/flows/` に YAML 形式で管理します。iOS シミュレーター・Android エミュレーターの両方で実行できます。

**ディレクトリ構成（`docs/test-cases.md` ベースへ移行中）:**

```
.maestro/
├── config.yaml            # ワークスペース設定（flows の glob）
├── scripts/               # runScript 用 JS（dev API を直叩きするデータ準備・後始末）
└── flows/
    ├── helpers/           # 共通ヘルパー（launch-app / login / hide-keyboard など）
    ├── <セクション番号-slug>/   # 新構成: docs/test-cases.md のセクションに対応
    │   └── <ケースID>-<slug>.yaml   # 例: 08-project-edit/PE-11-track-deleted-notice.yaml
    └── *.yaml             # 旧構成（フラット）。順次新構成へ移行する
```

- 新しいフローは**新構成**で作成し、`tags` にセクション ID（例: `PE`）とケース ID（例: `PE-11`）を付与する
- 削除や異常状態など UI 操作では準備しにくい前提データは、フロー内の `runScript`（`.maestro/scripts/*.js` + `http`）で dev API を直接呼び出してセットアップ・後始末する。テストデータ名には `e2e-` prefix を付け、セットアップ時に前回の残骸を掃除して冪等にする（例: `pe11-setup.js`）。作成に外部 API の実行（Replicate 等）が必要なデータは demo アカウントの既存サンプルを読み取り専用で使い、`updatedAt` の更新やブックマークで一覧先頭に出す（例: `sy05-setup.js`）
- リスト項目の `Pressable` は子テキストがグループ化され、ラベルが「タイトル, 日付 …」の連結になるため `'.*タイトル.*'` の部分一致で探す。表示領域の狭い内側の ScrollView では枠外の項目も階層上は「表示中」扱いになり `scrollUntilVisible` → `tapOn` が枠外をタップして失敗するため、対象を先頭に出す前提データにする
- ネイティブ UI（DocumentPicker / ImagePicker など）を伴う操作は E2E 対象外（導線表示までを検証し、実操作は `docs/test-cases.md` の手動確認に残す）

**実行前提:**
- `yarn start` で開発サーバーを起動済み（dev 環境に接続）。非対話で起動する場合は `CI=1 npx expo start`（ファイル監視なし。ソース変更後は再起動が必要）
- iOS シミュレーターまたは Android エミュレーターに開発ビルド（expo-dev-client）をインストール済み（初回のみ `yarn ios` / `yarn android`）
- **手動ログアウトは不要**（各フローが起動時に `clearState` + `clearKeychain` でアプリ状態を初期化し、ログイン画面から開始する。Expo Dev Client のランチャー画面・初回ダイアログ・Continue 後に残る開発メニュー（iOS は `Close`、Android は back）、iOS のパスワード保存ダイアログ（`今はしない`）も `helpers/launch-app.yaml` / `helpers/login.yaml` が自動処理する）

**実行方法:**

```bash
maestro test .maestro                    # 全フロー（config.yaml の glob で新旧構成とも実行）
maestro test .maestro --include-tags=PE  # セクション単位（tags で絞り込み）
maestro test .maestro/flows/login.yaml   # 単一フロー（ファイル指定）
# デバイスが複数接続されている場合は明示指定（例: Android エミュレーター）
maestro --device emulator-5554 test .maestro
```

> Android エミュレーターは `adb reverse tcp:8081 tcp:8081` により `localhost:8081` で Metro に接続できる（`expo start` から `a` で起動すれば自動設定）。

**テストアカウント（dev）:** `demo@example.com` / `password123`

**前提データ:** `project-detail` / `project-edit-save` / `project-delete` は demo アカウントに 1 件以上のプロジェクト、`track-play` は 1 件以上のトラックが dev 環境に存在することを前提とする。プロジェクト名などの可変データはアサートせず、固定 UI 要素（id）でアサートする。

**フロー作成時のルール:**
- アプリの起動・ログインは共通ヘルパーを使う（起動のみ: `helpers/launch-app.yaml` / ログインまで: `helpers/login.yaml`）
- `tapOn` のターゲットはラベル (`<Text>`) ではなくプレースホルダーテキスト（`<TextInput>` に紐づく）を使う
- `inputText` の入力値は ASCII のみにする（Android の Maestro は非 ASCII 入力をサポートしない。日本語テキストのマッチ（`tapOn` / `assertVisible`）は可能）
- テキスト入力後は `helpers/hide-keyboard.yaml` を `runFlow` してキーボードを閉じてからボタンをタップする（iOS: `pressKey: Enter` / Android: `hideKeyboard` のプラットフォーム分岐。`pressKey: Enter` を直接使わない）
- プラットフォーム固有の操作は `runFlow` の `when: platform: iOS` / `when: platform: Android` で分岐する
- ログイン後などアニメーションを伴う画面遷移には `waitForAnimationToEnd` を挟む
- 画面タイトルがアニメーション分割されている場合（例: `PROJECT LIST`）は部分テキストで `assertVisible` する

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
- `api/lambda/delete-profile.ts` — アカウント削除（退会。DynamoDB 全テーブル + S3 の該当ユーザーデータを物理削除）

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
- `src/hooks/useUploadRecord.ts` — 録音ファイルを S3 にアップロード → レコードとして保存（`projectId` 指定時はプロジェクトに紐づけ）
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
- `src/hooks/useDeleteAccount.ts` — アカウント削除（退会）API 呼び出し

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

3. **OpenAPI 定義を更新**
   - `api/openapi.yaml` にエンドポイント定義を追加し、API クライアントを再生成
   ```bash
   yarn openapi --input api/openapi.yaml --output src/apiClient
   ```
   - API Gateway 用定義が必要な場合は `src/data/*.ts` を更新し `yarn generate:openapi` で `api/openapi-aws.yaml` を再生成

4. **AWS dev にデプロイ**
   ```bash
   cd api && sam build && sam deploy --stack-name lyrics-dev-api --no-confirm-changeset
   ```
   （検証後、staging / production へは「デプロイフロー」のスキーマ反映手順で昇格させる）

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

# 2. API Gateway 用 OpenAPI 定義 (api/openapi-aws.yaml) を再生成
yarn generate:openapi

# 3. Lambda をビルドして AWS dev にデプロイ
cd api && sam build && sam deploy --stack-name lyrics-dev-api --no-confirm-changeset
```

### 注意事項

- **`src/apiClient/` は自動生成のため手動編集不可**。`api/openapi.yaml` を編集 → `yarn openapi --input api/openapi.yaml --output src/apiClient` で再生成する
- **Email フィールドは読み取り専用**（GSI のパーティションキーのため変更不可）
- **シードデータ（legacySource / legacyArtwork）**: `s3Key` を持たない既存トラックは `legacySource`/`legacyArtwork` フィールドにフォールバックする

---

## スラッシュコマンド一覧

| コマンド | 定義ファイル | 用途 |
|----------|-------------|------|
| `/notion` | `.claude/commands/notion.md` | Notion タスクの追加・更新・PR URL 登録・リリースフラグ・ページ追記 |
| `/task-parallel` | `.claude/commands/task-parallel.md` | 複数タスクを worktree + サブエージェントで並行実装 |
| `/task-done` | `.claude/commands/task-done.md` | 検証済みタスクの完了処理（Notion Done + リリース ON + develop PR） |
| `/commit` | `.claude/commands/commit.md` | コミットメッセージ規約（英語タイトル + 日本語本文）でコミット作成 |
| `/codex-review` | `.claude/commands/codex-review.md` | Codex CLI でコードレビュー実行 + 指摘対応 |
| `/pr-dev` | `.claude/commands/pr-dev.md` | 現在のブランチから dev への PR 作成（実機確認用） |
| `/pr-develop` | `.claude/commands/pr-develop.md` | 現在のブランチから develop への PR 作成 |
| `/pr-master` | `.claude/commands/pr-master.md` | develop から master への PR 作成（リリース用） |
| `/deploy-api-dev` | `.claude/commands/deploy-api-dev.md` | dev ブランチから `lyrics-dev-api`（開発者アカウント）への SAM デプロイ |
| `/deploy-api-stg` | `.claude/commands/deploy-api-stg.md` | develop ブランチから `flexq-stg-api`（運営者アカウント）への SAM デプロイ |
| `/testflight` | `.claude/commands/testflight.md` | EAS Build → TestFlight 配信 |
| `/playstore` | `.claude/commands/playstore.md` | EAS Build → Google Play 内部テスト配信（Android） |

---

## タスク管理（Notion × GitHub 連携）

### 概要

Claude Code から Notion MCP を経由してタスク管理を行う。GitHub との連携により、ブランチ・PR を Notion タスクと紐付けて管理する。

| 連携 | 内容 |
|------|------|
| Notion MCP | Claude Code から Notion を直接操作（タスク作成・更新） |
| GitHub × Notion | PR URL を Notion タスクに紐付け。Notion に GitHub リンクプレビューを表示 |

### Notion データベース

- **場所**: Lyrics タスク管理 > タスク一覧
- **URL**: https://www.notion.so/350780496c2f80dfaf79cba5e078123c

| プロパティ | 型 | 内容 |
|-----------|-----|------|
| リリース | チェックボックス | dev での動作確認 + develop マージ完了で ON（TestFlight / Play 配信対象の目印） |
| タイトル | テキスト | タスク名 |
| 簡単な詳細 | テキスト | 概要（1行） |
| デバイス | セレクト | Android / iPhone |
| 優先度 | セレクト | Low / Middle / High |
| ステータス | ステータス | Not started / In progress / Done / Pending |
| GitHub PR | URL | 対応する PR の URL |
| 備考 | テキスト | 補足メモ |

### ブランチ命名規則

Notion の ID プロパティ（`TASK-X`）をブランチ名の冒頭に付ける：

```
feature/TASK-X-タスクの概要
```

例：
```bash
git checkout -b feature/TASK-4-fix-default-thumbnail
```

### /notion スラッシュコマンド

Notion タスク管理操作は `/notion` スラッシュコマンドで実行する。
コマンド定義: `.claude/commands/notion.md`

#### タスク追加

```
/notion タスクを追加して
タイトル：〇〇〇
詳細：〇〇〇〇
デバイス：iPhone
優先度：High
```

自動で実施される内容：
- データベースの最大 TASK-X 番号を確認して次の ID を採番
- Notion にタスクを作成（ステータス: Not started）
- ページ本文に `## 詳細` セクションを挿入

#### ステータス更新

```
/notion TASK-X を In progress にして   # 作業開始時
/notion TASK-X を Done にして           # マージ完了時
```

#### リリースフラグ更新

```
/notion TASK-X をリリース済みにして    # dev での動作確認完了時（Done + リリース ON）
```

develop への PR 作成まで含めてまとめて行う場合は `/task-done TASK-X` を使う。

#### PR URL 登録

```
/notion TASK-X に PR URL を登録して
https://github.com/yoshiydp/flexq-mobile/pull/XX
```

#### ページ内容の追記・更新

```
/notion TASK-X に〇〇を追記して
/notion TASK-X の〇〇を修正して
```

### 運用フロー

タスクの着手からリリースまでの標準フロー。各ステップはスラッシュコマンドで自動実行できる。

```
① 着手          /task-parallel TASK-X ...  最新 develop から worktree + ブランチ作成、
                                           Notion を In progress に更新、並行実装
② 実装・検証    yarn test:ci + yarn lint → /codex-review → /commit
③ dev PR        feature → dev の PR を作成・マージ（GitHub Actions が dev チャンネルへ配信）
                └ Lambda（api/ 配下）に変更がある場合はマージ後に lyrics-dev-api へ手動 SAM デプロイ
④ 実機確認      iPhone / Android（dev チャンネル）で Test plan の項目を確認
⑤ 完了処理      /task-done TASK-X          Notion を Done + リリース ON、develop への PR 作成
⑥ develop 反映  develop PR をマージ（staging チャンネル = 運営側 stg へ配信）→ worktree を掃除
                └ Lambda 変更がある場合は flexq-stg-api へ手動 SAM デプロイ
⑦ リリース      /testflight（TestFlight 配信）・/playstore（Google Play 内部テスト配信）・/pr-master（production リリース）
```

#### ブランチ作成

Notion でタスクの ID（`TASK-X`）を確認し、**最新の origin/develop** からブランチを切る：

```bash
git checkout develop && git pull
git checkout -b feature/TASK-X-brief-description
```

複数タスクを並行する場合は git worktree を使う（`/task-parallel` が自動化）：

```bash
git worktree add ../flexq-mobile-worktrees/TASK-X -b feature/TASK-X-brief-description origin/develop
# develop へのマージ完了後に掃除
git worktree remove ../flexq-mobile-worktrees/TASK-X
```

#### コミットメッセージ規約

`/commit` が自動整形する。手動で書く場合も同じ形式にする：

- **タイトルは英語**の Conventional Commits 形式（`feat:` / `fix:` / `docs:` など）で 70 文字以内。ブランチに `TASK-X` が含まれる場合は末尾に `(TASK-X)` を付ける
- **本文は日本語**で変更の背景・原因・対応内容を記載する（タイトルのみのコミットは不可）
- 末尾に Claude の `Co-Authored-By` トレーラーを付ける

#### コードレビュー（Codex CLI）

コミット前に `/codex-review` を実行し、妥当な指摘に対応してからコミットする。実体は `codex review --base develop`（要 Codex CLI: `npm install -g @openai/codex` + `codex login`）。今回の diff と無関係な既存問題・誤検知は対応せず、その旨を報告する。

#### dev 検証後の develop 反映

feature ブランチは dev へのマージだけでは develop に取り込まれない。**dev（実機）で動作確認が完了したら、同じ feature ブランチから develop への PR を作成してマージする**（`/task-done` が Notion 更新とあわせて自動化）。develop へのマージで staging チャンネル（運営側 stg）へ配信され、リリース前検証・テスター配布の対象になる。同一ファイルを変更したブランチが複数ある場合は、マージ順を決めて 1 本ずつマージする。

#### リリースフラグ

Notion の「リリース」チェックボックスは **dev で正常に動作確認がとれ、develop へ反映した時点で ON** にする（`/task-done` が自動化）。TestFlight / Play 内部テスト配信時に、どのタスクが配信対象かをこのフラグで判別する。マージのみで動作確認が未了の場合は OFF のまま。

#### ファイルアップロードの mime タイプ

- `get-track-upload-url.ts`: `audio/mpeg`, `audio/wav`, `image/jpeg`, `image/png` のみ受け付ける
- `get-record-upload-url.ts`: 拡張子 `m4a`, `mp3`, `wav`, `aac` のみ受け付ける
