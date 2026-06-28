// ============================================================
// Source validator — check MangaSource structural validity
// ============================================================

import type { MangaSource } from '@zuixinmanhua/types';

const REQUIRED_FIELDS: (keyof MangaSource)[] = ['id', 'name', 'host'];
const REQUIRED_SEARCH_FIELDS = ['listSelector', 'titleSelector', 'coverSelector', 'detailUrlSelector'];
const REQUIRED_DETAIL_FIELDS = ['titleSelector'];
const REQUIRED_CHAPTER_FIELDS = ['listSelector', 'titleSelector', 'urlSelector'];
const REQUIRED_IMAGE_FIELDS = ['listSelector', 'srcAttribute'];

export function validateSource(source: MangaSource): boolean {
  if (!source || typeof source !== 'object') return false;

  // Required top-level fields
  for (const field of REQUIRED_FIELDS) {
    if (!source[field]) return false;
  }

  // Host must be a valid URL
  if (!source.host.startsWith('http://') && !source.host.startsWith('https://')) {
    return false;
  }

  // Search rules
  if (!source.search) return false;
  for (const field of REQUIRED_SEARCH_FIELDS) {
    const val = (source.search as unknown as unknown as Record<string, unknown>)[field];
    if (!val || typeof val !== 'string') return false;
  }

  // Detail rules
  if (!source.detail) return false;

  // Chapters rules
  if (!source.chapters) return false;
  for (const field of REQUIRED_CHAPTER_FIELDS) {
    const val = (source.chapters as unknown as Record<string, unknown>)[field];
    if (!val || typeof val !== 'string') return false;
  }

  // Image rules
  if (!source.images) return false;
  for (const field of REQUIRED_IMAGE_FIELDS) {
    const val = (source.images as unknown as Record<string, unknown>)[field];
    if (!val || typeof val !== 'string') return false;
  }

  return true;
}

export function validateAllSources(sources: MangaSource[]): { valid: MangaSource[]; invalid: { id: string; reason: string }[] } {
  const valid: MangaSource[] = [];
  const invalid: { id: string; reason: string }[] = [];

  for (const source of sources) {
    try {
      if (validateSource(source)) {
        valid.push(source);
      } else {
        invalid.push({ id: source.id || 'unknown', reason: 'Missing required fields' });
      }
    } catch (e: any) {
      invalid.push({ id: source.id || 'unknown', reason: e.message });
    }
  }

  return { valid, invalid };
}
