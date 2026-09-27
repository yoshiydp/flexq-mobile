# FlexQ AWS 環境移行手順書【全体設計・開発者向け】

> **状態: 確定版**(2026-07-30 新アプリ名 **FlexQ** に確定。AWS 上の表記は半角小文字の `flexq`)
>
> 本書は、現行の開発者 AWS アカウント(`140147588900`)で稼働中の Staging / Production 環境を
> **運営者名義の新しい AWS アカウント**へ移行し、あわせて開発者用の dev 環境を新設するための
> **全体設計と開発者側の作業手順**をまとめたもの。
>
> **運営者が実施する作業の詳細は、別冊 [aws-migration-operator-guide.md](aws-migration-operator-guide.md)
> (非エンジニア向け・自己完結)にまとめてある。運営者にはそちらを渡す。**
> 本書の第 II 部は、開発者が進行管理するための「運営者作業の概要と受け渡し物」のみを記載する。

### 本書のスコープ(重要)

**今回移行するのは AWS のみ。** 以下は当面すべて開発者管理のまま変更しない:

| 対象 | 扱い |
|------|------|
| Apple Developer / App Store Connect | 変更なし(開発者名義のまま。`/testflight` の運用も現行どおり) |
| Google Play Console | 変更なし(開発者名義のまま。`/playstore` の運用も現行どおり) |
| Bundle ID / パッケージ名(`com.yoshiydp.lyricsapp`) | 変更なし(刷新は将来の別マイルストーン) |
| Google OAuth(Google Cloud `lyrics-app-492415`) | 変更なし |
| Replicate(AI クリーンアップ) | 変更なし(トークン・費用とも当面開発側負担。**移行後に開発者が新環境へ設定する**。第 III 部 7) |

---

# 第 I 部 全体設計

## 1. 移行後の 3 環境構成

| 環境 | AWS アカウント | スタック名 | ブランチ | EAS Update チャンネル | 用途 |
|------|--------------|-----------|---------|---------------------|------|
| dev(新設) | 開発者(現行) | `lyrics-dev-api` | `dev`(新設) | `dev`(新設) | 開発者の日常開発・実機確認・E2E |
| staging | **運営者(新規)** | `flexq-stg-api` | `develop` | `staging` | リリース前検証(TestFlight / Play 内部テスト配信もここを向く) |
| production | **運営者(新規)** | `flexq-prod-api` | `master` | `production` | 本番 |

デプロイフロー:

```
feature/TASK-X ──PR──▶ dev ────────────▶ EAS Update: dev チャンネル + 開発側 AWS (lyrics-dev-api)
      │  実機確認 OK 後
      └────────PR──▶ develop ──────────▶ EAS Update: staging チャンネル + 運営側 AWS (flexq-stg-api)
                        │  検証 OK 後
                        └──PR──▶ master ▶ EAS Update: production チャンネル + 運営側 AWS (flexq-prod-api)
```

- 現行の `staging` ブランチは廃止し、役割(develop を汚さない実機確認場所)は `dev` ブランチが引き継ぐ
- `dev` ブランチはマージ専用。リリース区切りごとに `develop` で強制リセットして未マージ機能の滓を溜めない

## 2. データ移行の対応関係

既存の Staging / Production を**両方とも**運営側へ移行する:

| 移行元(開発者アカウント) | 移行先(運営者アカウント) |
|------|------|
| `lyrics-mock-api`(現 Staging)の DynamoDB 5 テーブル + S3 バケット | `flexq-stg-api` |
| `lyrics-prod-api`(現 Production)の DynamoDB 5 テーブル + S3 バケット | `flexq-prod-api` |

- リソースはすべて `api/template.yaml`(SAM)から自動構築するため、手作業でのリソース作成は行わない
- DynamoDB の `s3Key` はバケット名を含まない相対パスのため、S3 と DynamoDB を両方移行すれば紐付けはそのまま機能する
- ユーザーのパスワード(bcrypt ハッシュ)はデータごと移行されるため引き継がれる
- **JWT シークレットは stg / prod とも新規発行と決定(2026-08-01)**。アカウント分離にあわせてシークレットも分離する。切り替え後、全ユーザー(現状はテスターのみ)はアプリでの再ログインが必要になる(想定内の挙動)

## 3. 進行順序(推奨)

| 順 | 作業 | 担当 | 参照 |
|----|------|------|------|
| ① | dev 環境の新設・開発の dev 切り替え(**運営側の移行より先に実施可**) | 開発者 | 第 III 部 1 |
| ② | 受け渡し物の準備(読み取りキー・JWT・GitHub 招待 等) | 開発者 | 第 II 部 2 |
| ③ | AWS アカウント作成 〜 stg/prod 構築 〜 SES 設定 | 運営者 | 別冊 第 1〜6 章 |
| ④ | データ移行(タイミングは両者で調整。開発者による代行も可) | 運営者 | 別冊 第 7 章 |
| ⑤ | ブランチ再編・GitHub Secrets / eas.json 切り替え | 開発者 | 第 III 部 2〜4 |
| ⑥ | 動作確認 | 開発者(運営者も検証に参加) | 第 IV 部 1 |
| ⑦ | 旧環境の削除(安定稼働 2〜4 週間後) | 開発者 | 第 IV 部 2 |

---

# 第 II 部 運営者の作業(概要と受け渡し物)

> 詳細手順はすべて別冊 [aws-migration-operator-guide.md](aws-migration-operator-guide.md) に記載。
> ここでは開発者が進行管理・サポートするための要点のみをまとめる。

## 1. 運営者の作業概要(別冊の章構成)

| 別冊の章 | 内容 | 開発者のサポートポイント |
|------|------|------|
| 第 1 章 | ツール準備(Homebrew / AWS CLI / SAM 等)・リポジトリ取得 | GitHub 招待を事前に送る |
| 第 2 章 | AWS アカウント作成・MFA・東京リージョン・請求アラート($10) | — |
| 第 3 章 | IAM ユーザー作成(`flexq-admin` 作業用 / `flexq-deploy` CI 用) | `flexq-deploy` のキーを受け取る |
| 第 4 章 | CLI プロファイル設定(新 `flexq` / 旧 `lyrics-old`) | 旧環境の読み取りキーを渡す |
| 第 5 章 | `sam deploy` で `flexq-stg-api` / `flexq-prod-api` を構築 | JWT 等のパラメータを渡す。`ApiUrl` × 2 を受け取る |
| 第 6 章 | SES 送信元検証 + サンドボックス解除申請 | 送信元アドレスを指定する |
| 第 7 章 | データ移行(S3 sync × 2 + DynamoDB 移行スクリプト × 10 テーブル) | タイミング調整。**開発者が代行してもよい** |
| 第 8 章 | 完了報告(受け渡し①〜⑤の最終確認) | 「移行作業完了」連絡の受領 |

## 2. 開発者 → 運営者へ渡すもの(事前準備)

| 渡すもの | 準備方法 |
|---|---|
| GitHub リポジトリへの招待 | 運営者のユーザー名を聞いて `yoshiydp/flexq-mobile` に Read 権限で招待 |
| 旧環境の移行用読み取りアクセスキー | 現行アカウントに読み取り専用 IAM ユーザー(例: `migration-reader`、`ReadOnlyAccess` ポリシー)を新規作成してキーを発行(移行完了後に削除するため専用ユーザーにする) |
| JWT シークレット × 2 | stg / prod とも `openssl rand -base64 32` で新規生成(第 I 部 2 で新規発行と決定済み) |
| メール送信元アドレス | 現行 SES と同じアドレスを指定(検証メールのリンクは開発者がクリック) |

共有はパスワードマネージャーの共有機能等を使う(メール・LINE で平文送信しない)。
**いずれも運営者が別冊 第 1 章を始める前に渡しておく**(1-2 で受け取る前提になっている)。
Replicate トークンは運営者へ渡さない(開発側負担のため。移行後に開発者自身が設定する — 第 III 部 7)。

## 3. 運営者 → 開発者へ受け取るもの(受け渡し①〜⑤)

別冊では、開発者へ渡すものを **📤 受け渡し①〜⑤** として該当章の終わりに案内している(別冊冒頭に全体像表あり)。
受け取り漏れがないか、開発者側でも以下の順で追跡する:

| # | 受け取るもの | 受け取るタイミング(別冊) | 使い道 |
|---|---|---|---|
| ① | GitHub ユーザー名 | 第 1 章の開始前 | リポジトリへの Read 招待 |
| ② | `flexq-deploy` のアクセスキー | 第 3 章の完了時 | GitHub Secrets の `_OPS` キー(第 III 部 3) |
| ③ | staging / production の `ApiUrl` | 第 5 章の完了時(**第 8 章を待たず受領。この時点から第 III 部 3〜4 を並行着手できる**) | GitHub Secrets・eas.json(第 III 部 3〜4) |
| ④ | SES 検証完了・本番アクセス承認の連絡 | 第 6 章(検証時と承認メール到着時の 2 回) | パスワードリセットの動作確認可否 |
| ⑤ | データ検証結果(S3 個数・サイズ / DynamoDB 件数の一致) | 第 7 章の完了時 | 移行完了判定 |

別冊 第 8 章は①〜⑤の**最終確認チェックリスト**になっており、運営者からの「移行作業完了」連絡を受けて第 III 部・第 IV 部の残作業に進む。

---

# 第 III 部 開発者の作業(詳細)

## 1. dev 環境の新設(先行して実施可)

開発を止めないため、運営側への移行より先にやってよい。

1. 現行アカウントに dev スタックをデプロイ:
   ```bash
   cd api && sam build && sam deploy \
     --stack-name lyrics-dev-api \
     --region ap-northeast-1 --resolve-s3 \
     --capabilities CAPABILITY_IAM --no-confirm-changeset \
     --parameter-overrides JwtSecret="<dev 用シークレット>"
   ```
   `JwtSecret` は `Default` を持たない必須パラメータ(TASK-106 で既定値を撤廃・32 文字以上)。
   `openssl rand -base64 32` で発行した値を新規作成時に必ず指定する
2. dev 用データの投入: 別冊 7-2 と同じスクリプトの要領で、現 Staging(`lyrics-mock-api`)から
   `lyrics-dev-api` へ demo アカウント等をコピーする(プロファイルは両方とも現行アカウントで可)
3. `.env` の `EXPO_PUBLIC_API_BASE_URL` を dev の `ApiUrl` に変更(Maestro E2E の接続先も dev になる)

## 2. ブランチ再編と CI/CD

| ブランチ | デプロイ先 | 対応 |
|---------|----------|------|
| `dev`(新設) | EAS Update `dev` チャンネル + dev 環境 | `deploy-dev.yml` を新設(現 `deploy-staging.yml` をベースに、trigger: `dev` / channel: `dev` / URL: `EXPO_PUBLIC_API_BASE_URL_DEV`) |
| `develop` | EAS Update `staging` チャンネル(運営側 stg) | `deploy-staging.yml` の trigger を `staging` → `develop` に変更 |
| `master` | EAS Update `production` チャンネル(運営側 prod) | 変更なし(Secrets の差し替えのみ) |
| `staging`(廃止) | — | 移行完了後に削除 |

- `sync-schema-to-prod.yml` は運営側アカウントの認証情報(下記 `_OPS` キー)を使うよう変更し、
  「dev → stg → prod」の 2 段階昇格(stg 同期用ワークフローの追加)を検討

## 3. GitHub Secrets の更新

| Secret | 値 |
|--------|-----|
| `EXPO_PUBLIC_API_BASE_URL_DEV`(新規) | dev の `ApiUrl` |
| `EXPO_PUBLIC_API_BASE_URL` | **運営側 stg** の `ApiUrl` に差し替え |
| `EXPO_PUBLIC_API_BASE_URL_PROD` | **運営側 prod** の `ApiUrl` に差し替え |
| `AWS_ACCESS_KEY_ID_OPS` / `AWS_SECRET_ACCESS_KEY_OPS`(新規) | 運営者から受け取った `flexq-deploy` のキー |
| `JWT_SECRET_PROD` | 運営側 prod に設定した値と一致させる |

## 4. eas.json — ビルドへの API URL の明示(重要)

`.env` が dev を向くため、そのままだと **TestFlight / Play ビルドの初回起動(OTA 適用前)が dev API を向く**。
staging / production ビルドプロファイルに URL を明示して防ぐ:

```jsonc
"staging":    { "env": { "EXPO_PUBLIC_API_BASE_URL": "<運営側 stg の ApiUrl>" }, ... },
"production": { "env": { "EXPO_PUBLIC_API_BASE_URL": "<運営側 prod の ApiUrl>" }, ... }
```

`eas.json` に `dev` チャンネル用の update 設定が必要になった場合もあわせて追加する。

## 5. ドキュメント・スラッシュコマンドの更新

- `/pr-staging` → `/pr-dev` に改修(base: `dev`)。`/task-done`・`/deploy-api-staging`(→ `/deploy-api-dev` + `/deploy-api-stg`)も文言・対象を更新
- `CLAUDE.md`・`docs/staging-production-setup.md` の環境表・フロー記述を 3 環境構成に全面更新
- `yarn start:staging` の名称・接続先の見直し(dev 向けであることがわかる名前に)

## 6. リポジトリのリネーム(✅ 実施済み: 2026-07-31)

`lyrics-mobile` → `flexq-mobile` へ **GitHub の Rename 機能**で改名済み(リダイレクト動作確認済み)。
あわせて以下の後始末も完了している:

- ローカルの remote URL(SSH)を `git@github.com:yoshiydp/flexq-mobile.git` に更新
- `package.json` の `"name"` を `flexq-mobile` に変更
- `CLAUDE.md`・`AGENTS.md`・`.claude/commands/`(task-parallel / task-done / deploy-api-staging)の
  PR URL 例と worktree パス(`../flexq-mobile-worktrees/`)を更新
- 本書・別冊(運営者向け手順書)の `gh repo clone yoshiydp/flexq-mobile` 記載を更新

### 引き続き注意すること

> ⚠️ **`lyrics-mobile` という名前で新しいリポジトリを作らないこと。**
> 旧名が再利用されると自動リダイレクトが無効になり、旧 URL 参照(Notion の PR リンク等)が一斉に壊れる。

- ローカルのフォルダ名(`~/projects/lyrics-mobile`)は旧名のまま(リポジトリ名と独立のため任意。
  変える場合は VSCode のワークスペース・`~/.claude/projects/` のメモリパスが変わる点に留意)
- Replicate の既存 API トークン名 `lyrics-mobile` は実在するトークンの名前のためそのまま(ローテーション時に `flexq-mobile` 等で作り直せばよい)
- 今後の worktree 新規作成は `../flexq-mobile-worktrees/` を使う

### 影響しないもの(参考)

- EAS / Expo のプロジェクト(slug)・Bundle ID・ストア配信 — リポジトリ名と完全に独立
- GitHub Actions の workflow 定義・Secrets — リポジトリに紐づいたまま維持される
- 将来リポジトリを運営者の GitHub アカウントへ移す場合は「Transfer ownership」機能を使う(フォーク不要・リダイレクト付き)

## 7. Replicate トークンの設定(移行完了後)

Replicate(AI クリーンアップ)は**トークン・費用とも当面開発側負担**のため、運営者の作業には含めていない。
運営者の stg / prod デプロイ(別冊 第 5 章)は `ReplicateApiToken` 未設定で行われるので、
**未設定の間は AI クリーンアップのみ 503 を返す**(他機能への影響はない)。

移行完了後、開発者が `flexq-deploy` のキー(受け渡し②)をプロファイル登録し、両スタックへ設定する:

```bash
# flexq-deploy のキーを aws configure --profile flexq-ops で登録しておく
cd api && sam build
AWS_PROFILE=flexq-ops sam deploy --stack-name flexq-stg-api --region ap-northeast-1 \
  --resolve-s3 --capabilities CAPABILITY_IAM --no-confirm-changeset \
  --parameter-overrides ReplicateApiToken="<開発者の Replicate トークン>"
AWS_PROFILE=flexq-ops sam deploy --stack-name flexq-prod-api --region ap-northeast-1 \
  --resolve-s3 --capabilities CAPABILITY_IAM --no-confirm-changeset \
  --parameter-overrides ReplicateApiToken="<開発者の Replicate トークン>"
```

- `JwtSecret` / `SenderEmail` は既存スタックの更新であれば指定しなくても CloudFormation が前回値を保持する(`JwtSecret` に `Default` はないため、新規作成時のみ必須)
- 将来 Replicate の負担を運営者側へ移す場合は、運営者名義のトークンに差し替えて同じコマンドで再デプロイすればよい

---

# 第 IV 部 切り替え確認と後片付け

## 1. 動作確認チェックリスト

- [ ] dev: 開発サーバー起動でログイン・一覧表示・録音ができる
- [ ] dev: `dev` ブランチへのマージで EAS Update(dev チャンネル)が配信される
- [ ] stg: `develop` へのマージで EAS Update(staging チャンネル)が配信され、TestFlight アプリが新 stg API に接続する
- [ ] stg: 移行済みデータ(トラック・プロジェクト・録音)が表示・再生できる(= S3 Presigned URL が機能している)
- [ ] stg: 新規録音のアップロード・再生ができる
- [ ] stg: パスワードリセットメールが届く(SES サンドボックス解除後)
- [ ] stg: AI クリーンアップが動作する(第 III 部 7 のトークン設定後)
- [ ] prod: `master` マージで production チャンネルに配信され、本番データが表示される

## 2. 旧環境の扱い

- **新環境での動作確認が完全に取れるまで、旧スタックは削除しない**(切り戻し先として温存)
- 安定稼働の確認後(目安 2〜4 週間)、開発者が現行アカウントで以下を実施:
  1. S3 バケット(`lyrics-mock-api-*` / `lyrics-prod-api-*`)の中身を空にする
     (CloudFormation はバケットに中身があると削除に失敗するため)
  2. CloudFormation で `lyrics-prod-api` → `lyrics-mock-api` の順にスタックを削除(`lyrics-dev-api` は残す)
  3. 移行用読み取りユーザー(`migration-reader`)を削除
  4. `staging` ブランチと旧ワークフローの残骸を削除
  5. 運営者に「削除完了」を連絡(運営者側の `~/s3-migration` 片付けの合図。別冊 第 8 章)

### 実施状況(2026-09-27 時点)

**後片付けは完了**。以降、旧環境に関する作業はない。

| 手順 | 状況 |
|------|------|
| 1. S3 を空にする | 完了(`lyrics-prod-api-*` は元から空 / `lyrics-mock-api-*` は 123 ファイル・488MB を削除) |
| 2. 旧スタックの削除 | 完了(開発者アカウントに残る SAM スタックは `lyrics-dev-api` のみ) |
| 3. `migration-reader` の削除 | 完了(アクセスキー削除 → `ReadOnlyAccess` 解除 → ユーザー削除) |
| 4. `staging` ブランチ・旧ワークフロー | 完了(いずれも残骸なし) |
| 5. 運営者へ「削除完了」を連絡 | **不要と判断**(下記) |

手順 5 は**実施しない**。運営者は AWS の知識を持たず管理コンソールも操作しないため、
連絡しても対応できる作業がない(本来の目的は運営者側ローカルの `~/s3-migration` を
片付ける合図だった)。旧環境の削除状況は開発者側がこのドキュメントで把握していれば足りる。
運営者のローカルに移行時の作業ディレクトリが残る可能性はあるが、AWS 側には影響しない。

削除前に、旧 dev(`lyrics-mock-api`)にいた実アカウント 3 件
(`yoshihisa.watanabe.info` / `luz104tb` / `syamusyamu1124`)が、いずれも現 dev
(`lyrics-dev-api`)に存在することを確認している。

## 3. トラブルシューティング(開発者向け)

| 症状 | 原因と対処 |
|------|-----------|
| API が 503 を返す | `ReplicateApiToken` 未設定(AI クリーンアップのみの症状なら正常。他 API まで落ちていればデプロイ失敗を疑い CloudFormation のイベントを確認) |
| ログインできない(移行後) | JWT シークレットを新規発行したため再ログイン要求は正常(メール & パスワードでログインし直す) |
| TestFlight ビルドがデータ空で起動する | ビルドが dev API を向いている可能性。第 III 部 4(eas.json の `env` 明示)を確認 |
| 運営者側の作業で発生するエラー | 別冊 第 9 章に運営者向けの一次対応をまとめてある。解決しない場合は画面共有でサポート |
