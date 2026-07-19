import React, { useState, useEffect } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
import { useFonts } from 'expo-font';
// パッケージルートを import すると全ウェイトの ttf がバンドルされるため、
// 使用する Regular のみサブパスから import する（noto-sans-jp は全体で約 48MB）
import { BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue/400Regular';
import { NotoSans_400Regular } from '@expo-google-fonts/noto-sans/400Regular';
import { NotoSansJP_700Bold } from '@expo-google-fonts/noto-sans-jp/700Bold';
import { Allison_400Regular } from '@expo-google-fonts/allison/400Regular';
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
  const [fontsLoaded] = useFonts({
    BebasNeue_400Regular,
    NotoSans_400Regular,
    NotoSansJP_700Bold,
    Allison_400Regular,
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
