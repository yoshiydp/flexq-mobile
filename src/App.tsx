import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { useFonts, BebasNeue_400Regular } from '@expo-google-fonts/bebas-neue';
import { NotoSans_400Regular } from '@expo-google-fonts/noto-sans';
import { NotoSansJP_400Regular } from '@expo-google-fonts/noto-sans-jp';
import { Allison_400Regular } from '@expo-google-fonts/allison';
import RootNavigator from './navigation/RootNavigator';

export default function App() {
  const [fontsLoaded] = useFonts({
    BebasNeue_400Regular,
    NotoSans_400Regular,
    NotoSansJP_400Regular,
    Allison_400Regular,
  });

  if (!fontsLoaded) return null;

  return (
    <NavigationContainer>
      <RootNavigator />
    </NavigationContainer>
  );
}
