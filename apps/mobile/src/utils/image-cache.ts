// ============================================================
// apps/mobile/src/utils/image-cache.ts
// ★ 图片缓存 — expo-file-system 本地缓存 + LRU 淘汰
// ============================================================

import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';

const CACHE_DIR = `${FileSystem.cacheDirectory}comic-images/`;
const MAX_CACHE_MB = 200; // 默认 200MB
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天

/**
 * 获取缓存的图片本地 URI
 * 如果未缓存，则下载到本地
 */
export async function getCachedImageUri(
  remoteUrl: string,
): Promise<string> {
  const hash = await hashString(remoteUrl);
  const localUri = `${CACHE_DIR}${hash}.img`;

  // Check if cached
  const fileInfo = await FileSystem.getInfoAsync(localUri);
  if (fileInfo.exists) {
    // Check TTL
    if (fileInfo.modificationTime) {
      const age = Date.now() - fileInfo.modificationTime * 1000;
      if (age < TTL_MS) {
        return localUri;
      }
    } else {
      return localUri;
    }
  }

  // Download to cache
  await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  try {
    await FileSystem.downloadAsync(remoteUrl, localUri);
  } catch {
    // On download failure, return original URL (fallback)
    return remoteUrl;
  }

  // Trigger LRU cleanup
  enforceCacheLimit();

  return localUri;
}

/**
 * 批量预加载图片（下一章预取）
 */
export async function prefetchImages(urls: string[]): Promise<void> {
  const tasks = urls.map((url) => getCachedImageUri(url).catch(() => url));
  await Promise.allSettled(tasks);
}

/**
 * LRU 淘汰：超过 MAX_CACHE_MB 时删除最旧的文件
 */
async function enforceCacheLimit(): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(CACHE_DIR);
    if (!info.exists) return;

    const files = await FileSystem.readDirectoryAsync(CACHE_DIR);
    let totalSize = 0;
    const fileInfos: { name: string; mtime: number; size: number }[] = [];

    for (const name of files) {
      const fi = await FileSystem.getInfoAsync(`${CACHE_DIR}${name}`);
      if (fi.exists) {
        const size = 'size' in fi ? (fi.size || 0) : 0;
        totalSize += size;
        fileInfos.push({
          name,
          mtime: fi.modificationTime || 0,
          size,
        });
      }
    }

    const maxBytes = MAX_CACHE_MB * 1024 * 1024;
    if (totalSize <= maxBytes) return;

    // Delete oldest first
    fileInfos.sort((a, b) => a.mtime - b.mtime);

    for (const f of fileInfos) {
      if (totalSize <= maxBytes * 0.8) break;
      await FileSystem.deleteAsync(`${CACHE_DIR}${f.name}`, { idempotent: true });
      totalSize -= f.size;
    }
  } catch {
    // Silently ignore cleanup errors
  }
}

/**
 * 清除所有缓存
 */
export async function clearImageCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  } catch {
    // ignore
  }
}

/**
 * Simple string hash (SHA256 too heavy for this use case, use built-in)
 */
async function hashString(input: string): Promise<string> {
  // expo-crypto SHA256 for RN; fallback to simple hash
  try {
    const Crypto = require('expo-crypto');
    return await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      input,
    );
  } catch {
    // Fallback: simple DJB2 hash
    let hash = 5381;
    for (let i = 0; i < input.length; i++) {
      hash = ((hash << 5) + hash + input.charCodeAt(i)) | 0;
    }
    return Math.abs(hash).toString(16);
  }
}
