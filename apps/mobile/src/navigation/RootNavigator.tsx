// ============================================================
// apps/mobile/src/navigation/RootNavigator.tsx
// ─── BottomTabs (Library / Search / Settings) + Reader Modal
// ============================================================

import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Text } from 'react-native';
import { LibraryScreen } from '../screens/LibraryScreen';
import { SearchScreen } from '../screens/SearchScreen';
import { ComicDetailScreen } from '../screens/ComicDetailScreen';
import { ReaderScreen } from '../screens/ReaderScreen';
import { SettingsScreen } from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function LibraryStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="LibraryHome" component={LibraryScreen}
        options={{ title: '书架', headerLargeTitle: true }} />
      <Stack.Screen name="ComicDetail" component={ComicDetailScreen}
        options={{ title: '详情' }} />
    </Stack.Navigator>
  );
}

function SearchStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="SearchHome" component={SearchScreen}
        options={{ title: '搜索' }} />
      <Stack.Screen name="ComicDetail" component={ComicDetailScreen}
        options={{ title: '详情' }} />
    </Stack.Navigator>
  );
}

export function RootNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#6366f1',
      }}
    >
      <Tab.Screen
        name="LibraryTab"
        component={LibraryStack}
        options={{
          tabBarLabel: '书架',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>📚</Text>,
        }}
      />
      <Tab.Screen
        name="SearchTab"
        component={SearchStack}
        options={{
          tabBarLabel: '搜索',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>🔍</Text>,
        }}
      />
      <Tab.Screen
        name="SettingsTab"
        component={SettingsScreen}
        options={{
          tabBarLabel: '设置',
          tabBarIcon: ({ color }) => <Text style={{ color, fontSize: 20 }}>⚙️</Text>,
        }}
      />
    </Tab.Navigator>
  );
}

// Reader presented as a full-screen modal
export function AppNavigator() {
  return (
    <Stack.Navigator>
      <Stack.Screen name="Main" component={RootNavigator}
        options={{ headerShown: false }} />
      <Stack.Screen name="Reader" component={ReaderScreen}
        options={{
          headerShown: false,
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }} />
    </Stack.Navigator>
  );
}
