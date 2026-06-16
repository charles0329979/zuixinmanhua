// ============================================================
// apps/mobile/src/screens/ReaderScreen.tsx
// ★ 阅读器 — 长图下拉模式 + 自动保存进度 + 图片缓存
// ============================================================

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, Dimensions,
} from 'react-native';
import { useLibraryStore } from '../store/useLibraryStore';
import * as api from '../api/client';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function ReaderScreen({ route, navigation }: any) {
  const { source, comicId, chapterId, chapterTitle, title } = route.params;
  const [images, setImages] = useState<string[]>([]);
  const [detail, setDetail] = useState<api.ChapterDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showControls, setShowControls] = useState(true);
  const [scrollPercent, setScrollPercent] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const updateProgress = useLibraryStore((s) => s.updateProgress);
  const addHistory = useLibraryStore((s) => s.addHistory);

  useEffect(() => {
    loadImages();
  }, [source, comicId, chapterId]);

  const loadImages = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getChapterImages(source, comicId, chapterId);
      setDetail(data);
      setImages(data.images || []);

      // Record history
      addHistory({
        comicId,
        title: data.comicTitle || title || '',
        source,
        cover: '',
        chapterTitle: data.chapterTitle || chapterTitle || '',
      });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  // Auto-save progress on scroll
  const handleScroll = useCallback(
    (event: any) => {
      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      const maxY = contentSize.height - layoutMeasurement.height;
      const percent =
        maxY <= 0
          ? 100
          : Math.round((contentOffset.y / maxY) * 100);
      setScrollPercent(Math.min(100, percent));

      const totalImages = images.length || 1;
      const pageIndex = Math.floor(
        (contentOffset.y / Math.max(contentSize.height, 1)) * totalImages,
      );

      updateProgress({
        comicId,
        comicTitle: detail?.comicTitle || title || '',
        source,
        chapterId,
        chapterTitle: detail?.chapterTitle || chapterTitle || '',
        pageIndex,
      });
    },
    [comicId, source, chapterId, chapterTitle, title, images.length, detail, updateProgress],
  );

  const toggleControls = () => setShowControls((v) => !v);

  const goToChapter = (ch: { chapterId: string; title: string } | undefined) => {
    if (ch) {
      // Replace current screen params (re-trigger useEffect)
      setLoading(true);
      setImages([]);
      setDetail(null);
      navigation.setParams({
        chapterId: ch.chapterId,
        chapterTitle: ch.title,
      });
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color="#6366f1" size="large" />
        <Text style={styles.loadingText}>加载中...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>加载失败: {error}</Text>
        <TouchableOpacity style={styles.retryBtn} onPress={loadImages}>
          <Text style={styles.retryText}>重试</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Image strip */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        onScroll={handleScroll}
        scrollEventThrottle={200}
        showsVerticalScrollIndicator={false}
        onTouchEnd={toggleControls}
        removeClippedSubviews={true}
      >
        {images.map((url, i) => (
          <Image
            key={`${chapterId}-${i}`}
            source={{ uri: api.getImageProxyUrl(url, source) }}
            style={styles.image}
            resizeMode="contain"
          />
        ))}
        <View style={styles.endNav}>
          {detail?.prevChapter && (
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => goToChapter(detail.prevChapter)}
            >
              <Text style={styles.navText}>← 上一章</Text>
            </TouchableOpacity>
          )}
          {detail?.nextChapter && (
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => goToChapter(detail.nextChapter)}
            >
              <Text style={styles.navText}>下一章 →</Text>
            </TouchableOpacity>
          )}
        </View>
        <View style={styles.endPadding} />
      </ScrollView>

      {/* Floating Controls */}
      {showControls && (
        <View style={styles.controls}>
          <TouchableOpacity
            style={styles.controlBtn}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.controlText}>← 返回</Text>
          </TouchableOpacity>
          <Text style={styles.progressText}>{scrollPercent}%</Text>
          <Text style={styles.chapterLabel} numberOfLines={1}>
            {detail?.chapterTitle || chapterTitle}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: { color: '#94a3b8', marginTop: 12 },
  errorText: { color: '#f87171', fontSize: 16, marginBottom: 12 },
  retryBtn: { marginTop: 12, paddingHorizontal: 24, paddingVertical: 10,
    backgroundColor: '#6366f1', borderRadius: 8 },
  retryText: { color: '#fff', fontWeight: '600' },
  scroll: { flex: 1 },
  image: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 1.45 },
  endNav: {
    flexDirection: 'row', justifyContent: 'space-between',
    padding: 16, gap: 12,
  },
  navBtn: {
    flex: 1, backgroundColor: '#1e293b', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  navText: { color: '#cbd5e1', fontSize: 14, fontWeight: '500' },
  endPadding: { height: 80 },
  controls: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16, paddingTop: 44,
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  controlBtn: { padding: 8 },
  controlText: { color: '#fff', fontSize: 15 },
  progressText: { color: '#94a3b8', fontSize: 13 },
  chapterLabel: { color: '#fff', fontSize: 13, maxWidth: '40%', textAlign: 'right' },
});
