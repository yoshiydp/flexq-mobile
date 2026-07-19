import React, { useState, useEffect } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
// パッケージルートを import すると全ウェイトの ttf がバンドルされるため、
// 使用するウェイトのみサブパスから import する（noto-sans-jp は全体で約 48MB）
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
  // 注意: ここに登録するのは新規追加フォントのみにすること。既存の
  // 'NotoSans_400Regular' 等をランタイム登録すると、これまで未解決で
  // システムフォントにフォールバックしていた（fontWeight が効いていた）
  // 全画面のテキストが本物の Noto Sans Regular に切り替わり、iOS では
  // fontWeight が無視されて太字表示が失われる
  const [fontsLoaded] = useFonts({
    NotoSansJP_700Bold,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
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
