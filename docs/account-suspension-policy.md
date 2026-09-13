# アカウント停止（BAN）運用ポリシー (TASK-81)

規約違反・迷惑行為ユーザーのアカウントを停止する際の仕組みと運用ルール。

## 方式: 論理削除

BAN は物理削除ではなく **論理削除**（Users レコードの `status` 切り替え）で行う。

- 物理削除だと同じ email / Google アカウントですぐ再登録できてしまう
- 論理削除ならレコードが残るため、証拠保全と誤判定時の完全復旧が可能

| フィールド | 値 |
|-----------|---|
| `status` | `active`（未設定も active 扱い）/ `suspended` |
| `suspendedAt` | 停止日時（ISO 8601）。解除時に削除 |

DynamoDB のスキーマ変更（AttributeDefinitions / GSI）は不要。既存レコードは
`status` を持たないままで動作する。

## 遮断範囲

| 経路 | 挙動 |
|------|------|
| パスワードログイン（`post-auth-login`） | 403 Account suspended |
| Google ログイン（`post-auth-google`） | 403（googleSub / email どちらの照合でも） |
| トークンリフレッシュ（`post-auth-refresh`） | 403 |
| 発行済みアクセストークンでの API アクセス | 401（`auth-middleware` が Users の status を参照して即時遮断。コンテナ単位 60 秒キャッシュのため反映は最大約 60 秒） |
| 新規登録（`post-auth-register`） | 409 Email already in use（レコードが残るため自然にブロック） |
| Google での再登録（mode: register） | 403（既存レコードにヒットするため新規作成に進まない） |

## 実行手段（運営）

管理画面はスコープ外。`scripts/ban-user.ts` を CLI で実行する。

```bash
# 事前準備（初回のみ）: cd api && npm install

# BAN（email または userId 指定）
USERS_TABLE=<テーブル名> npx tsx scripts/ban-user.ts user@example.com

# 解除（データは保持されているため完全に復旧する）
USERS_TABLE=<テーブル名> npx tsx scripts/ban-user.ts user@example.com --unban

# staging / production は運営者アカウントのプロファイルを指定
AWS_PROFILE=flexq-ops USERS_TABLE=<テーブル名> npx tsx scripts/ban-user.ts ...
```

テーブル名は CloudFormation の Outputs から取得する:

```bash
aws cloudformation describe-stacks --stack-name flexq-prod-api \
  --query "Stacks[0].Outputs[?OutputKey=='UsersTableName'].OutputValue" --output text
```

## 保持期間ポリシー

- BAN したアカウントのデータ（Users / Projects / Tracks / Records / Memos /
  S3 オブジェクト）は、異議申し立て・誤判定時の復旧・証拠保全のため
  **BAN 日（`suspendedAt`）から 1 年間保持**する
- 1 年経過して解除の見込みがない場合は **物理削除**する。削除は TASK-80 の
  アカウント削除処理（`api/lambda/delete-profile.ts` /
  `account-deletion.ts` の削除順・S3 プレフィックス）を流用する
  （当面は件数が少ない想定のため手動運用。自動化はデータが増えてから検討）
- 物理削除後は同じ email / Google アカウントで再登録が可能になる（1 年の
  クールダウンとして許容する）
- ユーザー本人から退会（アカウント削除）の申し出があった場合は、保持期間中でも
  法令上の要請がない限り物理削除に応じる

## 運用メモ

- BAN 実行は必ず記録を残す（日時・対象 userId / email・理由）。当面は
  Notion のタスク管理に記録する
- **BAN はアカウント単位**（人物・Google 識別子単位ではない）。同一人物が
  別メールアドレスの別アカウントを持っている場合（例: 別アカウントに同じ
  Google アカウントを連携している場合）はそのアカウントには影響しないため、
  必要に応じて各アカウントを個別に BAN する
- 誤判定が判明したら `--unban` で即時復旧できる（データ・トークン以外の
  状態は一切変更されないため副作用なし）
- 解除後、ユーザーは再ログインすればそのまま利用を再開できる

## E2E 検証

- dev では `scripts/e2e-ban.sh` で自動確認できる（専用アカウント `e2e-ban@example.com` を BAN →
  `.maestro/flows/25-account-suspension/` を実行 → 解除）。AS-01 がログインの 403
  `Account suspended` と同じ email での再登録 409 を API で検証し、アプリ側の「Login Failed」
  表示を確認する
- Google ログインの拒否・発行済みトークンの遮断（最大 60 秒）・解除後の復旧は
  `docs/test-cases.md` の AS-02 / AS-03 / AS-05 として手動確認する
