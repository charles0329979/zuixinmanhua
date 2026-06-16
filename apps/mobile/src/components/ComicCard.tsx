// ============================================================
// apps/mobile/src/components/ComicCard.tsx
// 漫画卡片组件 — 封面 + 标题 + 来源 + 进度条
// ============================================================

import React from 'react';
import {
  View, Text, Image, TouchableOpacity, StyleSheet,
} from 'react-native';

interface ComicCardProps {
  comic: {
    title?: string;
    comicTitle?: string;
    cover?: string;
    source?: string;
    sourceName?: string;
    lastChapter?: string;
    chapterTitle?: string;
    pageIndex?: number;
  };
  progress?: {
    chapterTitle?: string;
    pageIndex?: number;
  };
  onPress?: () => void;
}

export function ComicCard({ comic, progress, onPress }: ComicCardProps) {
  const title = comic.title || comic.comicTitle || '未知';
  const cover = comic.cover || '';
  const sub = comic.sourceName || comic.source || '';

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.7}>
      <Image
        source={
          cover
            ? { uri: cover }
            : { uri: 'https://placehold.co/400x560/334155/64748b?text=No+Cover' }
        }
        style={styles.cover}
        resizeMode="cover"
        defaultSource={{ uri: 'https://placehold.co/400x560/1e293b/475569?text=...' }}
      />
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {sub ? (
        <Text style={styles.sub} numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
      {(comic.lastChapter || comic.chapterTitle) ? (
        <Text style={styles.chapter} numberOfLines={1}>
          {comic.lastChapter || comic.chapterTitle}
        </Text>
      ) : null}
      {progress ? (
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${Math.min(100, progress.pageIndex || 0)}%` }]} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1, maxWidth: '48%', marginBottom: 16,
    backgroundColor: '#1e293b', borderRadius: 10, overflow: 'hidden',
  },
  cover: {
    width: '100%', aspectRatio: 0.7, backgroundColor: '#334155',
  },
  title: {
    color: '#f1f5f9', fontSize: 14, fontWeight: '600',
    paddingHorizontal: 10, paddingTop: 8,
  },
  sub: {
    color: '#64748b', fontSize: 11, paddingHorizontal: 10, paddingTop: 2,
  },
  chapter: {
    color: '#94a3b8', fontSize: 12, paddingHorizontal: 10, paddingBottom: 8,
  },
  progressBar: {
    height: 2, backgroundColor: '#334155', marginHorizontal: 10, marginBottom: 8,
    borderRadius: 1, overflow: 'hidden',
  },
  progressFill: {
    height: '100%', backgroundColor: '#6366f1',
  },
});
