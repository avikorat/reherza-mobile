import React, { useCallback } from 'react';
import { View } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  useFonts,
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
  Manrope_800ExtraBold,
} from '@expo-google-fonts/manrope';

import { ThemeProvider } from './src/ThemeContext';
import { AuthProvider, useAuth } from './src/AuthContext';
import RootNavigator from './src/navigation/RootNavigator';
import { themes } from './src/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

function Root({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { restoring } = useAuth();

  const onReady = useCallback(async () => {
    if (fontsLoaded) await SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  // Hold the splash until fonts are in and the stored session is restored,
  // so the navigator can start on Main for a signed-in user.
  if (!fontsLoaded || restoring) return <View style={{ flex: 1, backgroundColor: themes.light.bg }} />;

  return (
    <NavigationContainer onReady={onReady}>
      <RootNavigator />
    </NavigationContainer>
  );
}

export default function App() {
  // Manrope is the one project typeface — weight carries the hierarchy, exactly
  // as on the web (see src/theme.ts).
  const [fontsLoaded] = useFonts({
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
    Manrope_800ExtraBold,
  });

  return (
    <SafeAreaProvider>
      <ThemeProvider initial="light">
        <AuthProvider>
          <Root fontsLoaded={fontsLoaded} />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
