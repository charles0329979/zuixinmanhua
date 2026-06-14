// ============================================================
// apps/mobile/src/screens/ReaderScreen.tsx
// ★ 阅读器 — 长图下拉模式 + 自动保存进度 + 图片预加载
// ============================================================

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, Image, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet, Dimensions, useColorScheme,
} from 'react-native';
import { useLibraryStore } from '../store/useLibraryStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export function ReaderScreen({ route, navigation }: any) {
  const { source, comicId, chapterId, chapterTitle } = route.params;
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showControls, setShowControls] = useState(true);
  const [scrollPercent, setScrollPercent] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const colorScheme = useColorScheme();

  const updateProgress = useLibraryStore((s) => s.updateProgress);

  useEffect(() => {
    loadImages();
  }, [chapterId]);

  const loadImages = async () => {
    setLoading(true);
    try {
      const baseUrl = 'http://10.0.2.2:3001/api';
      const res = await fetch(
        `${baseUrl}/chapter/${source}/${comicId}/${chapterId}`,
      );
      const data = await res.json();
      const imgs = data.images || data.data?.images || [];
      setImages(imgs);
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
      const percent =
        layoutMeasurement.height + contentOffset.y >= contentSize.height
          ? 100
          : Math.round(
              (contentOffset.y /
                (contentSize.height - layoutMeasurement.height)) *
                100,
            );

      setScrollPercent(percent);

      // Save progress
      updateProgress({
        comicId,
        comicTitle: route.params?.title || '',
        source,
        chapterId,
        chapterTitle: chapterTitle || '',
        pageIndex: Math.floor(
          (contentOffset.y / contentSize.height) * images.length,
        ),
        cover: '',
      });
    },
    [comicId, source, chapterId, chapterTitle, images.length],
  );

  const toggleControls = () => setShowControls(!showControls);

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
    <View style={[styles.container, colorScheme === 'dark' && styles.darkBg]}>
      {/* Image strip */}
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        onScroll={handleScroll}
        scrollEventThrottle={200}
        showsVerticalScrollIndicator={false}
        onTouchEnd={toggleControls}
      >
        {images.map((url, i) => (
          <Image
            key={i}
            source={{ uri: url }}
            style={styles.image}
            resizeMode="contain"
          />
        ))}
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
          <Text style={styles.chapterText}>{chapterTitle}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  darkBg: { backgroundColor: '#000' },
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: '#000',
  },
  loadingText: { color: '#94a3b8', marginTop: 12 },
  errorText: { color: '#f87171', fontSize: 16 },
  retryBtn: { marginTop: 16, paddingHorizontal: 24, paddingVertical: 10,
    backgroundColor: '#6366f1', borderRadius: 8 },
  retryText: { color: '#fff' },
  scroll: { flex: 1 },
  image: { width: SCREEN_WIDTH, height: SCREEN_WIDTH * 1.4 },
  endPadding: { height: 80 },
  controls: {
    position: 'absolute', top: 0, left: 0, right: 0,
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', padding: 16, paddingTop: 44,
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  controlBtn: { padding: 8 },
  controlText: { color: '#fff', fontSize: 15 },
  progressText: { color: '#94a3b8', fontSize: 13 },
  chapterText: { color: '#fff', fontSize: 13, maxWidth: '40%', textAlign: 'right' },
});
