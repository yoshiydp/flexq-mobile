EAS Build で iOS バイナリをビルドし、TestFlight へ配信するコマンドです。

## 手順

### 1. master を最新化

```bash
git checkout master && git pull origin master
```

### 2. EAS Build でビルド作成

```bash
eas build --profile staging --platform ios
```

- ビルド完了後、ログに表示される Build ID を控える
- 完了まで 10〜20 分程度かかる

### 3. App Store Connect へ提出

Build ID を指定して submit する:

```bash
eas submit --profile staging --platform ios --id <build_id>
```

- 完了後、App Store Connect の TestFlight にビルドが届く（5〜10 分）
- Apple からの処理完了メールが届いたら配信可能になる

## App Store Connect 情報

| 項目 | 値 |
|------|---|
| App ID | `6762039606` |
| Bundle ID | `com.yoshiydp.lyricsapp` |
| TestFlight URL | https://appstoreconnect.apple.com/apps/6762039606/testflight/ios |

## 注意事項

- ネイティブコード変更（yarn patch など）を含む場合は EAS Build が必須（EAS Update 不可）
- JS のみの変更であれば EAS Update（`eas update`）でよく、TestFlight ビルドは不要
- ビルド失敗時は Expo ダッシュボード（https://expo.dev）でログを確認する
