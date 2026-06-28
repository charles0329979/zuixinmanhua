// ============================================================
// Image URL normalization — shared between web and mobile
// ============================================================

/** Make a relative or absolute image URL safe for display */
export function normalizeImageUrl(
  url: string,
  sourceHost: string,
  proxyBase?: string,
): { rawUrl: string; proxyUrl: string } {
  let rawUrl = (url || '').trim();
  if (!rawUrl) return { rawUrl: '', proxyUrl: '' };

  // Resolve relative URLs
  if (!rawUrl.startsWith('http')) {
    if (rawUrl.startsWith('//')) {
      rawUrl = 'https:' + rawUrl;
    } else {
      rawUrl = sourceHost.replace(/\/$/, '') + (rawUrl.startsWith('/') ? rawUrl : '/' + rawUrl);
    }
  }

  const proxyUrl = proxyBase
    ? `${proxyBase.replace(/\/$/, '')}/proxy/image?url=${encodeURIComponent(rawUrl)}`
    : rawUrl;

  return { rawUrl, proxyUrl };
}

/** Get proxy URL for a cover image */
export function getCoverProxyUrl(rawUrl: string, proxyBase?: string): string {
  if (!proxyBase || !rawUrl) return rawUrl;
  return `${proxyBase.replace(/\/$/, '')}/proxy/image?url=${encodeURIComponent(rawUrl)}`;
}
