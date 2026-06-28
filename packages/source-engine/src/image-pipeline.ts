// ============================================================
// ImagePipeline — 图片加载策略
// Priority: local cache → direct CDN → server proxy fallback
// ============================================================

export interface ImageLoadResult {
  uri: string;
  /** 'cache' | 'direct' | 'proxy' */
  source: 'cache' | 'direct' | 'proxy';
}

export class ImagePipeline {
  constructor(
    private proxyBaseUrl?: string,
    private cacheDir?: string,
  ) {}

  /**
   * Get the best available image URI.
   * Mobile implementation can override with expo-file-system cache.
   */
  async loadImage(
    originalUrl: string,
    sourceId?: string,
  ): Promise<ImageLoadResult> {
    // Try local cache
    if (this.cacheDir) {
      const cached = await this.checkCache(originalUrl);
      if (cached) return { uri: cached, source: 'cache' };
    }

    // Try server proxy (adds Referer/UA, caches on server side)
    if (this.proxyBaseUrl) {
      const proxyUrl = `${this.proxyBaseUrl}/proxy/image?url=${encodeURIComponent(originalUrl)}${sourceId ? '&source=' + sourceId : ''}`;
      return { uri: proxyUrl, source: 'proxy' };
    }

    // Direct URL
    return { uri: originalUrl, source: 'direct' };
  }

  /** Stub: override with platform-specific cache check */
  private async checkCache(_url: string): Promise<string | null> {
    return null;
  }

  /** Get proxy URL for a batch of images */
  getProxyUrls(urls: string[], sourceId?: string): string[] {
    return urls.map(url => {
      if (!this.proxyBaseUrl) return url;
      const sid = sourceId ? `&source=${encodeURIComponent(sourceId)}` : '';
      return `${this.proxyBaseUrl}/proxy/image?url=${encodeURIComponent(url)}${sid}`;
    });
  }
}
