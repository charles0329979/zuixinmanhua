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

interface CardItem {
  id: string;
  comicId: string;
  title: string;
  source: string;
  cover?: string;
  lastChapter?: string;
  chapterTitle?: string;
  pageIndex?: number;
}

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

  const readingList: CardItem[] = Object.values(progress)
    .sort((a, b) => b.lastReadAt - a.lastReadAt)
    .map((p) => ({
      id: p.id,
      comicId: p.comicId,
      title: p.comicTitle,
      source: p.source,
      chapterTitle: p.chapterTitle,
      pageIndex: p.pageIndex,
    }));

  const favoritesList: CardItem[] = favorites.map((f) => ({
    id: f.id,
    comicId: f.comicId,
    title: f.title,
    source: f.source,
    cover: f.cover,
    lastChapter: f.lastChapter,
  }));

  const historyList: CardItem[] = history.map((h) => ({
    id: h.id,
    comicId: h.comicId,
    title: h.title,
    source: h.source,
    cover: h.cover,
    chapterTitle: h.chapterTitle,
  }));

  const data: CardItem[] =
    tab === 'reading' ? readingList :
    tab === 'favorites' ? favoritesList :
    historyList;

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
        data={data}
        keyExtractor={(item) => item.id}
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
                title: item.title,
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
    flexDirection: 'row', padding: 8,
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
  row: { paddingHorizontal: 4, marginBottom: 8 },
});
