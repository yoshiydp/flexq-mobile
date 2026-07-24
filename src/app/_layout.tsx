import React, { useState, useEffect } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
// パッケージルートを import すると全ウェイトの ttf がバンドルされるため、
// 使用するウェイトのみサブパスから import する（noto-sans-jp は全体で約 48MB）
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue/400Regular';
import { NotoSansJP_700Bold } from '@expo-google-fonts/noto-sans-jp/700Bold';
import { AuthProvider, useAuthContext } from '@/contexts/AuthContext';
import { ForegroundRefreshProvider } from '@/contexts/ForegroundRefreshContext';
import RootNavigator from '@/navigation/RootNavigator';
import AnimatedSplashScreen from '@/components/ui/AnimatedSplashScreen';
import { COLORS } from '@/globalStyles';
import { OpenAPI } from '@/apiClient';
import { getAccessToken } from '@/utils/authStorage';
import { installAuthTokenInterceptor } from '@/utils/authTokenInterceptor';

OpenAPI.BASE = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
OpenAPI.TOKEN = () => getAccessToken().then((t) => t ?? '');
installAuthTokenInterceptor();

function AppContent() {
  const { loading } = useAuthContext();
  const [splashVisible, setSplashVisible] = useState(true);

  useEffect(() => {
    if (!loading) {
      setTimeout(() => setSplashVisible(false), 2500);
    }
  }, [loading]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <RootNavigator />
      <AnimatedSplashScreen visible={splashVisible} />
    </SafeAreaView>
  );
}

export default function Layout() {
  // 実行時のルートはこの _layout.tsx（expo-router/entry）のため、ここでフォントを読み込む
  // (src/App.tsx はエントリーポイントとして使われておらず、そこでの useFonts は実行されない)
  //
  // ランタイム登録の方針（TASK-52 / TASK-56）:
  // - 登録名（このオブジェクトのキー）はスタイルの fontFamily 指定と完全一致させる。
  //   ランタイム登録なら iOS / Android で同じ名前で解決され、OTA 更新にも乗る
  //   （ネイティブ埋め込みは iOS: PostScript 名 / Android: ファイル名で解決名が
  //   食い違うため使わない。react-native.config.js の assets リンクも CNG では
  //   ビルドに反映されないため廃止済み）
  // - 'NotoSans_400Regular' は絶対に登録しないこと。スタイル上の
  //   fontFamily: 'NotoSans_400Regular' は意図的に未解決のままにしており、
  //   システムフォント（iOS: SF / Android: Roboto）にフォールバックさせることで
  //   併用している fontWeight: 600/700（約 20 ファイル）の太字を効かせている。
  //   実フォントを登録すると iOS / Android とも custom font には fontWeight の
  //   太字合成が効かず、太字表示が失われる
  // - fontWeight で太字にしたいテキストに新たにカスタムフォントを使う場合は、
  //   NotoSansJP_700Bold のようにウェイト別ファミリーを登録して明示指定する
  const [fontsLoaded] = useFonts({
    // 見出し・ボタン等のブランドフォント（fontFamily: 'BebasNeue' 18 箇所）
    BebasNeue: BebasNeue_400Regular,
    // Cue ラベル等の日本語ボールド（fontFamily: 'NotoSansJP_700Bold' 2 箇所）
    NotoSansJP_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      {/* ダークテーマ固定のため、端末のテーマ設定によらずステータスバーの
          アイコンを常にライト（白）にする。Android の edge-to-edge では
          userInterfaceStyle: automatic のままだとライトテーマ端末で
          暗い背景に黒アイコンが重なって見えなくなる（iOS も同様の明示）。
          edge-to-edge 有効時は backgroundColor / translucent は指定不可のため
          style のみ設定する */}
      <StatusBar style="light" />
      <AuthProvider>
        <ForegroundRefreshProvider>
          <AppContent />
        </ForegroundRefreshProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: COLORS.base.bgDefault,
  },
});
