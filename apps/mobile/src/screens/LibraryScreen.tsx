// ============================================================
// apps/mobile/src/screens/LibraryScreen.tsx
// 书架页 — 收藏 + 阅读中 + 历史 三个 Tab
// ============================================================

import React, { useState, useEffect } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
} from 'react-native';
import { useLibraryStore } from '../store/useLibraryStore';
import { ComicCard } from '../components/ComicCard';

type Tab = 'reading' | 'favorites' | 'history';

export function LibraryScreen({ navigation }: any) {
  const [tab, setTab] = useState<Tab>('reading');
  const {
    progress, favorites, history, isLoading,
    loadFavorites, loadProgress, loadHistory,
  } = useLibraryStore();

  useEffect(() => {
    loadFavorites();
    loadProgress();
    loadHistory();
  }, []);

  const readingList = Object.values(progress).sort(
    (a, b) => b.lastReadAt - a.lastReadAt,
  );

  const renderTab = () => {
    switch (tab) {
      case 'reading':
        return readingList;
      case 'favorites':
        return favorites;
      case 'history':
        return history;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        {(['reading', 'favorites', 'history'] as Tab[]).map((t) => (
          <TouchableOpacity
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {t === 'reading' ? '阅读中' : t === 'favorites' ? '收藏' : '历史'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        data={renderTab()}
        keyExtractor={(item) => item.id || item.comicId}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <ComicCard
            comic={item}
            progress={tab === 'reading' ? item : undefined}
            onPress={() =>
              navigation.navigate('ComicDetail', {
                source: item.source,
                comicId: item.comicId,
                title: item.title || item.comicTitle,
              })
            }
          />
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isLoading ? '加载中...' : '还没有漫画'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  tabs: {
    flexDirection: 'row', padding: 8, gap: 8,
    borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  tab: {
    flex: 1, paddingVertical: 10, alignItems: 'center',
    borderRadius: 8,
  },
  tabActive: { backgroundColor: '#6366f120' },
  tabText: { color: '#64748b', fontSize: 14, fontWeight: '500' },
  tabTextActive: { color: '#6366f1' },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 60, fontSize: 16 },
  row: { gap: 8, paddingHorizontal: 8 },
});
