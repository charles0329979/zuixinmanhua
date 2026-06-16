// ============================================================
// apps/mobile/src/screens/SettingsScreen.tsx
// 设置页 — 主题 / 服务器地址 / 连接测试 / 缓存 / 关于
// ============================================================

import React, { useState } from 'react';
import {
  View, Text, ScrollView, Switch, TouchableOpacity,
  TextInput, StyleSheet, Alert, ActivityIndicator,
} from 'react-native';
import { useSettingsStore } from '../store/useSettingsStore';
import { clearImageCache } from '../utils/image-cache';
import { getDefaultBaseUrl, getBaseUrl } from '../api/client';

type ConnStatus = 'idle' | 'testing' | 'ok' | 'fail';

export function SettingsScreen() {
  const {
    theme, brightness, readerMode, autoNextChapter,
    serverUrl,
    setTheme, setBrightness, setReaderMode, setAutoNextChapter,
    setServerUrl,
  } = useSettingsStore();

  const [editingUrl, setEditingUrl] = useState(serverUrl);
  const [connStatus, setConnStatus] = useState<ConnStatus>('idle');
  const [connResult, setConnResult] = useState('');
  const [clearing, setClearing] = useState(false);

  const handleClearCache = async () => {
    setClearing(true);
    try {
      await clearImageCache();
      Alert.alert('已清除', '图片缓存已清除');
    } catch {
      Alert.alert('错误', '清除缓存失败');
    } finally {
      setClearing(false);
    }
  };

  const handleTestConnection = async () => {
    setConnStatus('testing');
    setConnResult('');

    const base = getBaseUrl();
    // Try health endpoint first, then sources as fallback
    const urls = [`${base}/health`, `${base}/sources`];
    let lastError = '';

    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);

        const res = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
        });
        clearTimeout(timeout);

        const json = await res.json();

        if (url.endsWith('/health')) {
          const sources = Array.isArray(json) ? json : [];
          const healthy = sources.filter((s: any) => s.overallStatus === 'healthy').length;
          setConnStatus('ok');
          setConnResult(
            `✅ Server Online\n端口 3001\n书源: ${sources.length} 个 (${healthy} healthy)\n地址: ${base}`,
          );
        } else {
          setConnStatus('ok');
          setConnResult(
            `✅ Server Online\n端口 3001\n/health 格式异常但 /sources 可达\n地址: ${base}`,
          );
        }
        return;
      } catch (e: any) {
        if (e.name === 'AbortError') {
          lastError = `Timeout: ${url}`;
        } else {
          lastError = `${url}: ${e.message}`;
        }
      }
    }

    // All attempts failed
    setConnStatus('fail');
    setConnResult(
      `❌ 连接失败\n\n地址: ${base}\n\n可能原因:\n- 电脑 IP 未正确配置\n- 服务器未启动\n- 防火墙阻止端口 3001\n- 手机与电脑不在同一 WiFi\n\n错误: ${lastError}`,
    );
  };

  const statusColor =
    connStatus === 'ok' ? '#34d399' :
    connStatus === 'fail' ? '#f87171' :
    connStatus === 'testing' ? '#fbbf24' : '#64748b';

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.header}>设置</Text>

      {/* Server Connection */}
      <Text style={styles.section}>服务器连接</Text>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>API 地址</Text>
        </View>
        <TextInput
          style={styles.urlInput}
          value={editingUrl}
          onChangeText={setEditingUrl}
          onEndEditing={() => setServerUrl(editingUrl)}
          onSubmitEditing={() => setServerUrl(editingUrl)}
          placeholder={getDefaultBaseUrl()}
          placeholderTextColor="#475569"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text style={styles.urlHint}>
          默认: {getDefaultBaseUrl()}
        </Text>

        <TouchableOpacity
          style={styles.testBtn}
          onPress={handleTestConnection}
          disabled={connStatus === 'testing'}
        >
          {connStatus === 'testing' ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.testBtnText}>测试连接</Text>
          )}
        </TouchableOpacity>

        {connResult ? (
          <View style={[styles.resultBox, { borderColor: statusColor }]}>
            <Text style={[styles.resultText, { color: statusColor }]}>
              {connResult}
            </Text>
          </View>
        ) : null}
      </View>

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
          onPress={handleClearCache}
        >
          <Text style={styles.label}>清除图片缓存</Text>
          <Text style={styles.arrow}>{clearing ? '...' : '清理'}</Text>
        </TouchableOpacity>
      </View>

      {/* About */}
      <Text style={styles.section}>关于</Text>
      <View style={styles.card}>
        <Text style={styles.label}>ComicReader V2.0</Text>
        <Text style={styles.subtext}>
          个人漫画聚合阅读器{'\n'}
          React Native (Expo) + NestJS + Next.js
        </Text>
      </View>

      <View style={{ height: 60 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  header: { color: '#f1f5f9', fontSize: 28, fontWeight: 'bold', marginBottom: 24, marginTop: 16 },
  section: { color: '#6366f1', fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 16, textTransform: 'uppercase' },
  card: { backgroundColor: '#1e293b', borderRadius: 12, padding: 16, gap: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: '#f1f5f9', fontSize: 16 },
  subtext: { color: '#64748b', fontSize: 13, marginTop: 4, lineHeight: 20 },
  arrow: { color: '#64748b', fontSize: 15 },
  segmented: { flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 8, overflow: 'hidden' },
  seg: { paddingHorizontal: 14, paddingVertical: 6 },
  segActive: { backgroundColor: '#6366f1', borderRadius: 8 },
  segText: { color: '#64748b', fontSize: 13 },
  segTextActive: { color: '#fff' },
  urlInput: {
    backgroundColor: '#0f172a', borderRadius: 8,
    paddingHorizontal: 14, paddingVertical: 10,
    color: '#f1f5f9', fontSize: 14,
    borderWidth: 1, borderColor: '#334155',
  },
  urlHint: { color: '#475569', fontSize: 12 },
  testBtn: {
    backgroundColor: '#6366f1', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  testBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  resultBox: {
    borderWidth: 1, borderRadius: 8,
    padding: 12, marginTop: 4,
  },
  resultText: { fontSize: 13, lineHeight: 20 },
});
