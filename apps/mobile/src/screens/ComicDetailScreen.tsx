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

interface ChapterItem {
  chapterId: string;
  title: string;
  url: string;
  index: number;
}

export function ComicDetailScreen({ route, navigation }: any) {
  const { source, comicId, title: routeTitle } = route.params;
  const [detail, setDetail] = useState<any>(null);
  const [chapters, setChapters] = useState<ChapterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isFavorite = useLibraryStore((s) =>
    s.favorites.some((f) => f.comicId === comicId),
  );
  const addFavorite = useLibraryStore((s) => s.addFavorite);
  const removeFavorite = useLibraryStore((s) => s.removeFavorite);
  const progress = useLibraryStore((s) => s.progress[`${source}:${comicId}`]);

  useEffect(() => {
    loadDetail();
  }, [source, comicId]);

  const loadDetail = async () => {
    setLoading(true);
    try {
      // 从后端获取详情和章节
      const baseUrl = 'http://10.0.2.2:3001/api'; // Android emulator → host
      const [detailRes, chaptersRes] = await Promise.all([
        fetch(`${baseUrl}/comic/${source}/${comicId}`).then((r) => r.json()),
        fetch(`${baseUrl}/comic/${source}/${comicId}/chapters`).then((r) => r.json()),
      ]);
      setDetail(detailRes.data || detailRes);
      setChapters(chaptersRes.data || chaptersRes.chapters || []);
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
    });
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6366f1" size="large" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      {/* Hero */}
      <View style={styles.hero}>
        <Image
          source={{ uri: detail?.cover }}
          style={styles.cover}
          resizeMode="cover"
        />
        <View style={styles.meta}>
          <Text style={styles.title}>{detail?.title || routeTitle}</Text>
          <Text style={styles.author}>{detail?.author || '未知作者'}</Text>
          <Text style={styles.status}>
            {detail?.status === 'completed' ? '已完结' : '连载中'}
          </Text>
          <Text style={styles.desc} numberOfLines={4}>
            {detail?.description || '暂无简介'}
          </Text>
        </View>
      </View>

      {/* Actions */}
      <View style={styles.actions}>
        {progress ? (
          <TouchableOpacity
            style={styles.readBtn}
            onPress={() => handleRead(progress.chapterId, progress.chapterTitle || '')}
          >
            <Text style={styles.readBtnText}>继续阅读 {progress.chapterTitle}</Text>
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
          <Text style={styles.favBtnText}>{isFavorite ? '❤️ 已收藏' : '🤍 收藏'}</Text>
        </TouchableOpacity>
      </View>

      {/* Chapter List */}
      <View style={styles.chapterList}>
        <Text style={styles.sectionTitle}>章节列表 ({chapters.length})</Text>
        {chapters.reverse().map((ch) => (
          <TouchableOpacity
            key={ch.chapterId}
            style={styles.chapterItem}
            onPress={() => handleRead(ch.chapterId, ch.title)}
          >
            <Text style={styles.chapterTitle} numberOfLines={1}>
              {ch.title}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' },
  hero: { flexDirection: 'row', padding: 16, gap: 16 },
  cover: { width: 120, height: 170, borderRadius: 8 },
  meta: { flex: 1 },
  title: { color: '#f1f5f9', fontSize: 20, fontWeight: 'bold' },
  author: { color: '#94a3b8', fontSize: 14, marginTop: 4 },
  status: { color: '#34d399', fontSize: 13, marginTop: 4 },
  desc: { color: '#94a3b8', fontSize: 13, marginTop: 8, lineHeight: 20 },
  actions: { flexDirection: 'row', padding: 16, gap: 12 },
  readBtn: {
    flex: 1, backgroundColor: '#6366f1', borderRadius: 10,
    paddingVertical: 14, alignItems: 'center',
  },
  readBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  favBtn: {
    paddingHorizontal: 20, borderRadius: 10, borderWidth: 1,
    borderColor: '#334155', justifyContent: 'center',
  },
  favBtnActive: { borderColor: '#f87171' },
  favBtnText: { color: '#f1f5f9', fontSize: 14 },
  chapterList: { padding: 16 },
  sectionTitle: { color: '#f1f5f9', fontSize: 17, fontWeight: '600', marginBottom: 12 },
  chapterItem: {
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#1e293b',
  },
  chapterTitle: { color: '#cbd5e1', fontSize: 14 },
});
