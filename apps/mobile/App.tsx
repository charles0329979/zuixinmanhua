// ============================================================
// apps/mobile/App.tsx — ComicReader V2 Entry Point
// ============================================================

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSettingsStore } from './src/store/useSettingsStore';
import { RootNavigator } from './src/navigation/RootNavigator';

export default function App() {
  const theme = useSettingsStore((s) => s.theme);

  return (
    <SafeAreaProvider>
      <NavigationContainer
        theme={
          theme === 'dark'
            ? {
                dark: true,
                colors: {
                  primary: '#6366f1',
                  background: '#0f172a',
                  card: '#1e293b',
                  text: '#f1f5f9',
                  border: '#334155',
                  notification: '#ef4444',
                },
              }
            : undefined
        }
      >
        <RootNavigator />
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
