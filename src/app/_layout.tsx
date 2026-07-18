import React, { useState, useEffect } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StyleSheet } from 'react-native';
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
