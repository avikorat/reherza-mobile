import React, { useCallback } from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Archivo_400Regular,
  Archivo_500Medium,
  Archivo_600SemiBold,
  Archivo_700Bold,
  Archivo_800ExtraBold,
} from '@expo-google-fonts/archivo';
import {
  PlayfairDisplay_600SemiBold,
  PlayfairDisplay_700Bold,
} from '@expo-google-fonts/playfair-display';

import { ThemeProvider } from './src/ThemeContext';
import { AuthProvider, useAuth } from './src/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { restoring } = useAuth();

  const onReady = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // Hold the splash until fonts are in and the stored session is restored,
  // so the navigator can start on Main for a signed-in user.
  if (!fontsLoaded || restoring) return <View style={{ flex: 1, backgroundColor: '#0E0B09' }} />;

  return (
    <NavigationContainer onReady={onReady}>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    Archivo_800ExtraBold,
    PlayfairDisplay_600SemiBold,
    PlayfairDisplay_700Bold,
  });

  return (
    <SafeAreaProvider>
      <ThemeProvider initial="paper">
        <AuthProvider>
          <Root fontsLoaded={fontsLoaded} />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
