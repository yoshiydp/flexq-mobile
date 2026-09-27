/**
 * 開発ビルド用のアプリバリアント (TASK-123)
 *
 * TestFlight / Play 内部テストのビルドと開発ビルドはバンドル ID が同じだと
 * 共存できず（iOS は署名違いの上書きを許さない）、確認のたびに片方を
 * アンインストールする必要があった。
 *
 * `APP_VARIANT=development` のときだけバンドル ID・パッケージ名・アプリ名を
 * 変えて、両方を同じ端末に入れられるようにする。
 * eas.json の `development-device` プロファイルでこの環境変数を設定している。
 *
 * ※ シミュレーター / エミュレーター向けのローカルビルド（`yarn ios` /
 *    `yarn android`）と EAS の `development` プロファイルでは設定しない。
 *    TestFlight 版が入らない環境では衝突せず、E2E（.maestro の appId は
 *    素の `com.yoshiydp.lyricsapp`）もそのまま動かせるため。
 *
 * app.json の内容が `config` として渡ってくるので、差分だけ上書きする。
 */

const BASE_BUNDLE_ID = 'com.yoshiydp.lyricsapp';
const DEV_BUNDLE_ID = `${BASE_BUNDLE_ID}.dev`;

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

module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'development') return config;

  return {
    ...config,
    // ホーム画面で TestFlight 版と見分けられるようにする
    name: 'FlexQ Dev',
    // ディープリンクのスキームも分ける（両方入っていると宛先が曖昧になるため）
    scheme: 'mobile-dev',
    ios: {
      ...config.ios,
      bundleIdentifier: DEV_BUNDLE_ID,
      infoPlist: {
        ...config.ios?.infoPlist,
        ...(devIosUrlScheme
          ? { CFBundleURLTypes: [{ CFBundleURLSchemes: [devIosUrlScheme] }] }
          : {}),
      },
    },
    android: {
      ...config.android,
      package: DEV_BUNDLE_ID,
      // Google OAuth のリダイレクトに使われるため、パッケージ名と揃える
      scheme: DEV_BUNDLE_ID,
    },
  };
};
