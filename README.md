# LYRICS

## 🎯 アプリの目的

**LYRICS** は、音楽アーティストのためのモバイルアプリです。  
リリック（歌詞）作成から音源の取り込み・録音までを一体化した制作支援ツールとして開発されています。

- 音源をリアルタイムで再生しながらリリックを執筆可能
- 音楽プレイヤーのように再生シーケンスを自由に移動可能
- 思いついたフレーズやメロディをその場で録音・メモとして保存可能
- シンガー、ラッパー、ミュージシャンが直感的に扱えるシンプルな設計

手軽に「リリック × 録音 × 再生」を行える、創作支援アプリを目指しています。

---

## 💻 開発環境

| 項目    | バージョン |
| ------- | ---------- |
| Node.js | 22.16.0    |
| npm     | 10.9.2     |
| yarn    | 1.22.22    |

**主要技術:** React Native（Expo） + TypeScript

---

## 🎥 開発中のデモ

<video src="https://github.com/user-attachments/assets/73e39b03-5a9d-45b3-b2a9-604aed8f542b" width="600" autoplay loop muted playsinline></video>

<video src="https://github.com/user-attachments/assets/2a49e83c-c177-47f4-9774-f4f98d5d1be0" width="600" autoplay loop muted playsinline></video>

---

## 📦 初期セットアップ

1. **依存パッケージのインストール**

   ```bash
   yarn install
   ```

2. **Expo の起動**

   ```bash
   yarn start
   ```

   コンソールに表示される QR コードを **Expo Go** アプリで読み取るか、以下のキー操作で実行します：

   - iOS シミュレーター：`i`
   - Android エミュレーター：`a`
   - 開発ビルド：`shift + i` / `shift + a`

3. **開発フォルダ構成**
   - [Expo Router](https://docs.expo.dev/router/introduction) によるファイルベースルーティングを採用しています。

---

## ⚙️ OpenAPI YAML 生成方法

`api/openapi.yaml` は自動生成スクリプトで構築します。  
（`src/data/` 内の TypeScript ファイルを解析して、`api/templates/base.yaml` をもとに統合）

1. **依存関係の確認**

   ```bash
   yarn install
   ```

2. **OpenAPI YAML の生成**

   ```bash
   yarn generate:openapi
   ```

   実行後、`api/openapi.yaml` が生成されます。

---

## 🌐 Swagger UI での確認方法

1. **Swagger UI 起動**

   ```bash
   yarn mock:server
   ```

2. **ブラウザで確認**

   ```
   http://localhost:3000
   ```

3. **他デバイスからアクセスする場合（同一 LAN 上）**

   開発マシンの IP アドレスを確認：

   ```bash
   ifconfig | grep "inet "
   ```

   出力例：

   ```
   inet 192.168.0.23
   ```

   `api/openapi.yaml` の以下の箇所を自身の IP アドレスに変更：

   ```yaml
   servers:
     - url: http://192.168.1.7:3000
       description: Local Swagger Mock API
   ```

   その IP を使って他デバイスのブラウザからアクセス：

   ```
   http://192.168.0.23:3000
   ```

---

## 🧰 トラブルシューティング

- **モジュール解決エラー（Unable to resolve module）発生時**

  ```bash
  rm -rf node_modules .expo .expo-shared
  yarn cache clean
  yarn install
  yarn start -c
  ```

- **ポート競合エラー発生時**
  ```bash
  npx kill-port 8080
  ```
