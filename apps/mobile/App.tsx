// ============================================================
// apps/mobile/App.tsx — ComicReader V2 Entry Point
// ============================================================

import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useSettingsStore } from './src/store/useSettingsStore';
import { AppNavigator } from './src/navigation/RootNavigator';
import { getDatabase } from './src/database';

function SplashScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
      <Text style={{ color: '#6366f1', fontSize: 32, fontWeight: 'bold' }}>ComicReader</Text>
      <Text style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>个人漫画阅读器 V2</Text>
      <ActivityIndicator style={{ marginTop: 24 }} color="#6366f1" />
    </View>
  );
}

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const [dbReady, setDbReady] = useState(false);

  useEffect(() => {
    // Initialize SQLite database on startup
    getDatabase()
      .then(() => {
        console.log('[App] Database initialized');
        setDbReady(true);
      })
      .catch((err) => {
        console.warn('[App] Database init failed, continuing without SQLite:', err.message);
        setDbReady(true); // Don't block the app on DB failure
      });
  }, []);

  if (!dbReady) {
    return <SplashScreen />;
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer
        theme={
          theme === 'dark'
            ? {
                dark: true,
                fonts: {
                  regular: { fontFamily: 'System', fontWeight: '400' },
                  medium: { fontFamily: 'System', fontWeight: '500' },
                  bold: { fontFamily: 'System', fontWeight: '700' },
                  heavy: { fontFamily: 'System', fontWeight: '900' },
                },
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
        <AppNavigator />
        <StatusBar style={theme === 'dark' ? 'light' : 'dark'} />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
