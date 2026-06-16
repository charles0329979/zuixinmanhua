// ============================================================
// apps/mobile/src/utils/image-cache.ts
// ★ 图片缓存 — expo-file-system 本地缓存 + LRU 淘汰
// ============================================================

import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';

const CACHE_DIR = `${FileSystem.cacheDirectory}comic-images/`;
const MAX_CACHE_MB = 200;
const TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Get cached local URI for a remote image URL */
export async function getCachedImageUri(remoteUrl: string): Promise<string> {
  const hash = await hashUrl(remoteUrl);
  const localUri = `${CACHE_DIR}${hash}.img`;

  // Check if already cached and valid
  const fileInfo = await FileSystem.getInfoAsync(localUri);
  if (fileInfo.exists) {
    if (fileInfo.modificationTime) {
      const age = Date.now() - fileInfo.modificationTime * 1000;
      if (age < TTL_MS) return localUri;
    } else {
      return localUri;
    }
  }

  // Download to cache
  await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  try {
    await FileSystem.downloadAsync(remoteUrl, localUri);
  } catch {
    return remoteUrl; // fallback: use original URL
  }

  // Async cleanup
  enforceCacheLimit().catch(() => {});

  return localUri;
}

/** Prefetch a batch of image URLs into cache */
export async function prefetchImages(urls: string[]): Promise<void> {
  const tasks = urls.map((url) => getCachedImageUri(url).catch(() => url));
  await Promise.allSettled(tasks);
}

/** LRU eviction: remove oldest files when over MAX_CACHE_MB */
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
        const size = (fi as any).size || 0;
        totalSize += size;
        fileInfos.push({ name, mtime: fi.modificationTime || 0, size });
      }
    }

    const maxBytes = MAX_CACHE_MB * 1024 * 1024;
    if (totalSize <= maxBytes) return;

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

/** Clear all image cache */
export async function clearImageCache(): Promise<void> {
  try {
    await FileSystem.deleteAsync(CACHE_DIR, { idempotent: true });
    await FileSystem.makeDirectoryAsync(CACHE_DIR, { intermediates: true });
  } catch {
    // ignore
  }
}

/** SHA256 hash a URL string (expo-crypto) */
async function hashUrl(input: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    input,
  );
}
