// ============================================================
// apps/mobile/src/screens/ComicDetailScreen.tsx
// 漫画详情页 — 封面 + 信息 + 章节列表 + 收藏/继续阅读
// ============================================================

import React, { useEffect, useState } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { useLibraryStore } from '../store/useLibraryStore';
import * as api from '../api/client';

interface ChapterItem {
  chapterId: string;
  title: string;
  url?: string;
  index: number;
}

export function ComicDetailScreen({ route, navigation }: any) {
  const { source, comicId, title: routeTitle } = route.params;
  const [detail, setDetail] = useState<api.ComicDetail | null>(null);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isFavorite = useLibraryStore((s) =>
    s.favorites.some((f) => f.comicId === comicId && f.source === source),
  );
  const addFavorite = useLibraryStore((s) => s.addFavorite);
  const removeFavorite = useLibraryStore((s) => s.removeFavorite);
  const progress = useLibraryStore((s) => s.progress[`${source}:${comicId}`]);

  useEffect(() => {
    loadDetail();
  }, [source, comicId]);

  const loadDetail = async () => {
    setLoading(true);
    setError('');
    try {
      const [detailData, chaptersData] = await Promise.all([
        api.getComicDetail(source, comicId),
        api.getChapters(source, comicId),
      ]);
      setDetail(detailData);
      setChapters(chaptersData || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleFavorite = () => {
    if (isFavorite) {
      removeFavorite(source, comicId);
    } else {
      addFavorite({
        comicId,
        title: detail?.title || routeTitle,
        source,
        cover: detail?.cover || '',
        author: detail?.author,
        lastChapter: chapters[0]?.title,
        status: detail?.status || 'ongoing',
      });
    }
  };

  const handleRead = (chapterId: string, chapterTitle: string) => {
    navigation.navigate('Reader', {
      source, comicId, chapterId, chapterTitle,
      title: detail?.title || routeTitle,
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6366f1" size="large" />
      </View>
    );
  }

  if (error && !detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>加载失败: {error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadDetail}>
          <Text style={styles.retryText}>重试</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Reverse chapters so newest is first (server returns oldest first)
  const displayChapters = [...chapters].reverse();

  return (
    <ScrollView style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        {detail?.cover ? (
          <Image
            source={{ uri: detail.cover }}
            style={styles.cover}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.cover, styles.coverPlaceholder]} />
        )}
        <View style={styles.meta}>
          <Text style={styles.title}>{detail?.title || routeTitle}</Text>
          <Text style={styles.author}>{detail?.author || '未知作者'}</Text>
          <Text style={styles.source}>来源: {source}</Text>
          <Text style={styles.status}>
            {detail?.status === 'completed' ? '已完结' : '连载中'}
          </Text>
          {detail?.description ? (
            <Text style={styles.desc} numberOfLines={4}>
              {detail.description}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {progress ? (
          <TouchableOpacity
            style={styles.readBtn}
            onPress={() => handleRead(progress.chapterId, progress.chapterTitle || '')}
          >
            <Text style={styles.readBtnText}>
              继续阅读 {progress.chapterTitle || ''}
            </Text>
          </TouchableOpacity>
        ) : chapters.length > 0 ? (
          <TouchableOpacity
            style={styles.readBtn}
            onPress={() => handleRead(chapters[0].chapterId, chapters[0].title)}
          >
            <Text style={styles.readBtnText}>开始阅读</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          style={[styles.favBtn, isFavorite && styles.favBtnActive]}
          onPress={handleToggleFavorite}
        >
          <Text style={styles.favBtnText}>
            {isFavorite ? '♥ 已收藏' : '♡ 收藏'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Chapter List */}
      <View style={styles.chapterList}>
        <Text style={styles.sectionTitle}>
          章节列表 ({chapters.length})
        </Text>
        {displayChapters.map((ch) => (
          <TouchableOpacity
            key={ch.chapterId}
            style={[
              styles.chapterItem,
              progress?.chapterId === ch.chapterId && styles.chapterItemActive,
            ]}
            onPress={() => handleRead(ch.chapterId, ch.title)}
          >
            <Text
              style={[
                styles.chapterTitle,
                progress?.chapterId === ch.chapterId && styles.chapterTitleActive,
              ]}
              numberOfLines={1}
            >
              {ch.title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  errorText: { color: '#f87171', fontSize: 16, marginBottom: 12 },
  retryBtn: { paddingHorizontal: 24, paddingVertical: 10, backgroundColor: '#6366f1', borderRadius: 8 },
  retryText: { color: '#fff' },
  hero: { flexDirection: 'row', padding: 16 },
  cover: { width: 120, height: 170, borderRadius: 8, backgroundColor: '#334155' },
  coverPlaceholder: {},
  meta: { flex: 1, marginLeft: 16 },
  title: { color: '#f1f5f9', fontSize: 20, fontWeight: 'bold' },
  author: { color: '#94a3b8', fontSize: 14, marginTop: 4 },
  source: { color: '#6366f1', fontSize: 12, marginTop: 4 },
  status: { color: '#34d399', fontSize: 13, marginTop: 4 },
  desc: { color: '#94a3b8', fontSize: 13, marginTop: 8, lineHeight: 20 },
  actions: { flexDirection: 'row', padding: 16 },
  readBtn: {
    flex: 1, backgroundColor: '#6366f1', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  readBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  favBtn: {
    marginLeft: 12, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1,
    borderColor: '#334155', justifyContent: 'center',
  },
  favBtnActive: { borderColor: '#ef4444', backgroundColor: '#ef444420' },
  favBtnText: { color: '#f1f5f9', fontSize: 14 },
  chapterList: { padding: 16 },
  sectionTitle: { color: '#f1f5f9', fontSize: 17, fontWeight: '600', marginBottom: 12 },
  chapterItem: {
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  chapterItemActive: { backgroundColor: '#1e293b', borderRadius: 6, paddingHorizontal: 8 },
  chapterTitle: { color: '#cbd5e1', fontSize: 14 },
  chapterTitleActive: { color: '#6366f1' },
});
