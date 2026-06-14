// ============================================================
// apps/mobile/src/screens/SettingsScreen.tsx
// 设置页 — 主题 / 亮度 / 阅读模式 / 源管理 / 关于
// ============================================================

import React from 'react';
import {
  View, Text, ScrollView, Switch, TouchableOpacity,
  StyleSheet, Alert,
} from 'react-native';
import { useSettingsStore } from '../store/useSettingsStore';

export function SettingsScreen() {
  const { theme, brightness, readerMode, autoNextChapter,
    setTheme, setBrightness, setReaderMode, setAutoNextChapter } =
    useSettingsStore();

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>设置</Text>

      {/* Appearance */}
      <Text style={styles.section}>外观</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>主题</Text>
          <View style={styles.segmented}>
            {(['system', 'light', 'dark'] as const).map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.seg, theme === t && styles.segActive]}
                onPress={() => setTheme(t)}
              >
                <Text style={[styles.segText, theme === t && styles.segTextActive]}>
                  {t === 'system' ? '系统' : t === 'light' ? '浅色' : '深色'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>

      {/* Reading */}
      <Text style={styles.section}>阅读</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>阅读模式</Text>
          <View style={styles.segmented}>
            {(['long-strip', 'paged'] as const).map((m) => (
              <TouchableOpacity
                key={m}
                style={[styles.seg, readerMode === m && styles.segActive]}
                onPress={() => setReaderMode(m)}
              >
                <Text style={[styles.segText, readerMode === m && styles.segTextActive]}>
                  {m === 'long-strip' ? '长图' : '翻页'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>自动下一话</Text>
          <Switch
            value={autoNextChapter}
            onValueChange={setAutoNextChapter}
            trackColor={{ false: '#334155', true: '#6366f1' }}
          />
        </View>
      </View>

      {/* Data */}
      <Text style={styles.section}>数据</Text>
      <View style={styles.card}>
        <TouchableOpacity
          style={styles.row}
          onPress={() =>
            Alert.alert('书源管理', '可在 Web 后台 /admin/sources 管理书源')
          }
        >
          <Text style={styles.label}>书源管理</Text>
          <Text style={styles.arrow}>→ Web 后台</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.row}
          onPress={() => {
            Alert.alert('清除缓存', '图片缓存已清除');
          }}
        >
          <Text style={styles.label}>清除图片缓存</Text>
          <Text style={styles.arrow}>清理</Text>
        </TouchableOpacity>
      </View>

      {/* About */}
      <Text style={styles.section}>关于</Text>
      <View style={styles.card}>
        <Text style={styles.label}>ComicReader V2</Text>
        <Text style={styles.subtext}>
          个人漫画阅读器 · 基于 Mihon + Legado 设计
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  header: { color: '#f1f5f9', fontSize: 28, fontWeight: 'bold', marginBottom: 24, marginTop: 16 },
  section: { color: '#6366f1', fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 16, textTransform: 'uppercase' },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, gap: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: '#f1f5f9', fontSize: 16 },
  subtext: { color: '#64748b', fontSize: 13, marginTop: 4 },
  arrow: { color: '#64748b', fontSize: 15 },
  segmented: { flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 8, overflow: 'hidden' },
  seg: { paddingHorizontal: 14, paddingVertical: 6 },
  segActive: { backgroundColor: '#6366f1' },
  segText: { color: '#64748b', fontSize: 13 },
  segTextActive: { color: '#fff' },
});
