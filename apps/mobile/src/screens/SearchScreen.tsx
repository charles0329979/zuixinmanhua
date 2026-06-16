// ============================================================
// apps/mobile/src/screens/SearchScreen.tsx
// 搜索页 — 输入关键词 → 跨源聚合搜索 → 结果列表
// ============================================================

import React, { useState, useCallback } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useSearch } from '../hooks/useSearch';
import { ComicCard } from '../components/ComicCard';

export function SearchScreen({ navigation }: any) {
  const [query, setQuery] = useState('');
  const { results, loading, error, search } = useSearch();

  const handleSearch = useCallback(() => {
    if (query.trim()) search(query.trim());
  }, [query, search]);

  return (
    <View style={styles.container}>
      <View style={styles.searchBar}>
        <TextInput
          style={styles.input}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          placeholder="搜索漫画..."
          placeholderTextColor="#94a3b8"
          returnKeyType="search"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchBtnText}>搜索</Text>
        </TouchableOpacity>
      </View>

      {loading && (
        <ActivityIndicator style={styles.loader} color="#6366f1" />
      )}

      {error && (
        <Text style={styles.error}>{error}</Text>
      )}

      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <ComicCard
            comic={{
              title: item.title,
              cover: item.cover,
              source: item.source,
              sourceName: item.sourceName,
              lastChapter: item.latestChapter,
            }}
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
          !loading ? (
            <Text style={styles.empty}>
              {query ? '没有找到相关漫画' : '输入关键词搜索'}
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  searchBar: { flexDirection: 'row', padding: 12, gap: 8 },
  input: {
    flex: 1, backgroundColor: '#1e293b', borderRadius: 10,
    paddingHorizontal: 16, paddingVertical: 10, color: '#f1f5f9',
    fontSize: 16,
  },
  searchBtn: {
    backgroundColor: '#6366f1', borderRadius: 10,
    paddingHorizontal: 20, justifyContent: 'center',
  },
  searchBtnText: { color: '#fff', fontWeight: '600' },
  loader: { marginTop: 40 },
  error: { color: '#f87171', textAlign: 'center', marginTop: 20, paddingHorizontal: 16 },
  empty: { color: '#64748b', textAlign: 'center', marginTop: 60, fontSize: 16 },
  row: { gap: 8, paddingHorizontal: 8 },
});
