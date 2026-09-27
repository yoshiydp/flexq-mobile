/**
 * ビルドバリアントごとの設定 (TASK-123)
 *
 * 環境変数 `APP_VARIANT` で切り替える。eas.json の各ビルドプロファイルで設定する。
 *
 * | APP_VARIANT   | アプリ名   | バンドル ID                   | アイコン | 使うプロファイル          |
 * |---------------|-----------|------------------------------|---------|-------------------------|
 * | development   | FlexQ Dev | com.yoshiydp.lyricsapp.dev   | Dev 帯  | development-device      |
 * | staging       | FlexQ     | com.yoshiydp.lyricsapp       | STG 帯  | staging                 |
 * | （未設定）     | FlexQ     | com.yoshiydp.lyricsapp       | 素      | production・ローカルビルド |
 *
 * ■ バンドル ID を分ける理由
 * TestFlight / Play 内部テストのビルドと開発ビルドはバンドル ID が同じだと共存できず
 * （iOS は署名違いの上書きを許さない）、確認のたびに片方を消す必要があった。
 * 開発バリアントだけ別 ID にして同じ端末に並べられるようにしている。
 *
 * ■ ローカルビルド（`yarn ios` / `yarn android`）では APP_VARIANT を設定しない
 * シミュレーター / エミュレーターには TestFlight 版が入らず衝突しないうえ、
 * E2E（.maestro の appId は素の `com.yoshiydp.lyricsapp`）をそのまま動かせるため。
 *
 * ■ アイコンはネイティブ資産なので OTA では変わらない
 * 帯付きアイコンが反映されるのは次回のビルドから。
 * 画像は `swift scripts/generate-variant-icons.swift` で生成する。
 */

const BASE_BUNDLE_ID = 'com.yoshiydp.lyricsapp';
const IMAGES = './src/assets/images';

/**
 * Google ログインの iOS 用 URL スキーム（逆順クライアント ID）。
 *
 * OAuth クライアントはバンドル ID に紐づくため、開発バリアントで Google ログインを
 * 使うには `com.yoshiydp.lyricsapp.dev` 用の iOS クライアントを Google Cloud で
 * 別途作成し、その逆順クライアント ID を EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME に
 * 設定する必要がある。未設定の間は app.json の値のままになり、
 * 開発バリアントでは Google ログインだけが失敗する（メール / パスワードは使える）。
 */
const devIosUrlScheme = process.env.EXPO_PUBLIC_GOOGLE_IOS_URL_SCHEME;

/** アイコンだけを差し替える（バンドル ID・アプリ名は変えない） */
const withIcons = (config, suffix) => ({
  ...config,
  icon: `${IMAGES}/icon-${suffix}.png`,
  android: {
    ...config.android,
    adaptiveIcon: {
      ...config.android?.adaptiveIcon,
      foregroundImage: `${IMAGES}/adaptive-icon-${suffix}.png`,
    },
  },
});

module.exports = ({ config }) => {
  const variant = process.env.APP_VARIANT;

  if (variant === 'staging') {
    // TestFlight / Play 内部テスト向け。ストア配信と同じ ID・名前のままアイコンだけ分ける
    return withIcons(config, 'stg');
  }

  if (variant !== 'development') return config;

  const devConfig = withIcons(config, 'dev');
  return {
    ...devConfig,
    // ホーム画面で TestFlight 版と見分けられるようにする
    name: 'FlexQ Dev',
    // ディープリンクのスキームも分ける（両方入っていると宛先が曖昧になるため）
    scheme: 'mobile-dev',
    ios: {
      ...devConfig.ios,
      bundleIdentifier: `${BASE_BUNDLE_ID}.dev`,
      infoPlist: {
        ...devConfig.ios?.infoPlist,
        ...(devIosUrlScheme
          ? { CFBundleURLTypes: [{ CFBundleURLSchemes: [devIosUrlScheme] }] }
          : {}),
      },
    },
    android: {
      ...devConfig.android,
      package: `${BASE_BUNDLE_ID}.dev`,
      // Google OAuth のリダイレクトに使われるため、パッケージ名と揃える
      scheme: `${BASE_BUNDLE_ID}.dev`,
    },
  };
};
