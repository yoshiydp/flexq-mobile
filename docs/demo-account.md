# ストア審査用デモアカウント

App Store / Google Play の審査で使う専用アカウントと、その中に入れるテストデータについてまとめる。
開発・E2E で使う `demo@example.com` とは別物なので、混同しないこと。

## アカウント

| 項目 | 値 |
|------|---|
| メールアドレス / パスワード | `demo-assets/credentials.txt`（gitignore 済み） |
| 表示名 | FlexQ Demo |
| 投入済み | staging（`flexq-stg-api`）2026-09-05 / production（`flexq-prod-api`）2026-10-24 |
| 審査への登録 | App Store Connect の App Review 情報に登録済み（1.0.0 / build 36 で初回申請・2026-10-25） |

**認証情報はリポジトリに置かない。** 審査担当者に渡す共有アカウントのため、メールアドレスも含めてコミットしない。

- 審査で実際に使われるのは**リリースするバイナリが向く production**。prod のデータを入れ直すときも下記の投入手順を使う
- 認証情報の登録先: App Store Connect の「App Review Information > Sign-In Required」、Google Play Console の「アプリのアクセス権」
- ログイン（`post-auth-login.ts`）はメールとパスワードの照合のみで、メール確認も 2FA も無い。審査担当者がメールを受信する場面は無い
- パスワード再設定は登録メール宛ての認証コードが必須（TASK-85）。審査担当者が「パスワードをお忘れですか」を
  試してもコードを受け取れないため、App Store Connect に登録した認証情報が勝手に変わることはない
- SES は本番アクセス承認済み（2026-09-16）で、`+flexq-review` エイリアス宛ての認証コードも
  `yoshihisa.watanabe.info@gmail.com` の受信箱に届く
- 審査用の録音（プロジェクトに紐付くテイク 1〜2 本・うち 1 本は AI クリーンアップ済み）は、
  production の TestFlight ビルドから実機で追加済み（2026-10-25。後述「実機で追加する分」）

## 素材とライセンス

| 種別 | 内容 | 出典 | ライセンス |
|------|------|------|-----------|
| トラック音源 | Lo-fi インスト 4 曲（One Night In France / Ghost Town / Canon Event / Fractured） | [HoliznaCC0 – Public Domain Lofi](https://freemusicarchive.org/music/holiznacc0/public-domain-lofi)（Free Music Archive） | **CC0 1.0 Universal**（パブリックドメイン。クレジット表記も不要） |
| アートワーク / プロフィール画像 | 5 枚 | 自作（[scripts/generate-demo-artwork.py](../scripts/generate-demo-artwork.py) で生成） | 自社著作物 |
| 波形データ | トラックから生成 | 自作（シードスクリプトが ffmpeg で生成） | 自社著作物 |

> 音源を差し替える場合も **CC0 / パブリックドメインに限定する**こと。Pixabay・Unsplash などの独自ライセンスは
> 「コンテンツをそのまま再配布する行為」に制限があり、アプリ同梱データとしてはグレーになる。
> 差し替えたら必ずこの表の出典を更新する。

## 素材の置き場所

`demo-assets/` に置く（`.gitignore` / `.easignore` 済み。リポジトリにも EAS ビルドにも含めない）。

```
demo-assets/
├── tracks/     # mp3 / wav を 4 本（ファイル名の昇順が TRACKS の順に対応）
├── artworks/   # generate-demo-artwork.py の出力 5 枚
└── voice/      # クイックレコード用の音声（任意）
```

再クローンなどで消えた場合は、アートワークは生成し直し、音源は上記 FMA のアルバムから取り直す。

## 投入手順

```bash
# 1. アートワークを生成（初回・素材が消えたとき）
python3 -m venv .venv && .venv/bin/pip install pillow
.venv/bin/python scripts/generate-demo-artwork.py demo-assets/artworks

# 2. 音源を demo-assets/tracks/ に配置（FMA は無料アカウントのログインが必要）

# 3. 投入内容の確認（API は呼ばない）
node scripts/seed-demo-account.mjs --dry-run

# 4. staging へ投入
node scripts/seed-demo-account.mjs --env stg --email <mail> --password <pass>

# 5. TestFlight / Play 内部テストで見栄えを確認したうえで production へ
node scripts/seed-demo-account.mjs --env prod --email <mail> --password <pass>
```

> **新規登録には認証コードが必要（TASK-85 以降）。** 指定したメールが未登録の環境では、
> スクリプトが認証コードを送信してから入力を求めるので、**受信できるメールアドレスを使う**こと
> （SES は本番アクセス承認済みで任意の宛先に届く）。届いたコードを `--code 123456` で渡して
> 非対話的に実行することもできる。有効期限内の再送は拒否されるため、届いたコードをそのまま使う。
> 登録済みの環境（ログインが通る場合）はコード不要。

[scripts/seed-demo-account.mjs](../scripts/seed-demo-account.mjs) は**再実行できるよう、投入前に既存の
トラック / プロジェクト / メモ / レコードを全削除する**。デモアカウント以外を指定しないこと。

## 投入されるデータ

| 種別 | 件数 | 備考 |
|------|------|------|
| トラック | 4 | 音源 + アートワーク + 波形 JSON |
| プロジェクト | 4 | それぞれトラックに紐付け |
| クイックメモ | 4 | うち 2 件はブックマーク済み |
| クイックレコード | 0〜2 | `demo-assets/voice/` に素材がある場合のみ |

### 実機で追加する分

**プロジェクトに紐付く録音（同時再生のデモ）はスクリプトでは作らない。**
`startPositionMs` や `recordedWithHeadphones` は実際の録音でしか自然な値が入らず、
API 直挿しだと同時再生・ミックスが不自然になるため（TASK-89 の経緯を参照）。

投入後にデモアカウントでログインし、プロジェクトを開いて 1〜2 テイク録音しておく。
AI クリーンアップも 1 テイクだけ実行しておくと、審査で機能を確認しやすい。
