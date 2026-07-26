EAS Build で Android バイナリ（AAB）をビルドし、Google Play 内部テストへ配信するコマンドです。

## 前提条件

- Google Play Console のアプリ登録（パッケージ名 `com.yoshiydp.lyricsapp`）が完了していること
- サービスアカウント JSON キーが `credentials/google-play-service-account.json` に配置されていること（gitignore 済み・コミット禁止）
- **最初の 1 本目の AAB は Play Console から手動アップロード済みであること**（未実施の場合は `eas submit` が失敗する。CLAUDE.md「Google Play 内部テスト配信」参照）

## 手順

### 1. master を最新化

```bash
git checkout master && git pull origin master
```

### 2. EAS Build でビルド作成（AAB）

```bash
eas build --profile staging --platform android
```

- ビルド完了後、ログに表示される Build ID を控える
- 完了まで 10〜20 分程度かかる

### 3. Google Play 内部テストトラックへ提出

Build ID を指定して submit する:

```bash
eas submit --profile staging --platform android --id <build_id>
```

- `eas.json` の `submit.staging.android`（`serviceAccountKeyPath` + `track: "internal"`）が使われる
- 完了後、数分で内部テストのテスターに配信される（審査なし）

## Google Play Console 情報

| 項目 | 値 |
|------|---|
| パッケージ名 | `com.yoshiydp.lyricsapp` |
| 配信トラック | 内部テスト（`internal`） |
| サービスアカウントキー | `credentials/google-play-service-account.json`（ローカル配置・git 管理外） |
| Play Console | https://play.google.com/console |

## テスターへの配布

1. Play Console → テスト → 内部テスト → 「テスター」タブでテスターの Google アカウント（メールアドレス）を追加
2. 「リンクをコピー」で参加 URL を取得し、LINE やメールで送る
3. テスターはリンクを開いて「参加」→ Play ストアからインストール（専用アプリ不要）

## 注意事項

- ネイティブコード変更（yarn patch など）を含む場合は EAS Build が必須（EAS Update 不可）
- JS のみの変更であれば EAS Update（`eas update`）でよく、Play ストアビルドは不要
- production プロファイルも当面は `track: "internal"`。リリース段階でクローズドテスト → 製品版トラックへ昇格する（`eas.json` の `submit.production.android.track` を変更）
- ストア掲載情報が未完了で submit が失敗する場合は `releaseStatus: "draft"` を一時的に追加する（CLAUDE.md 参照）
- ビルド失敗時は Expo ダッシュボード（https://expo.dev）でログを確認する
