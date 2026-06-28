// ============================================================
// SourceCache — local storage for cached rule sources
// ============================================================

import type { MangaSource } from '@zuixinmanhua/types';
import type { CacheEntry } from './types';

export interface StorageBackend {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

const PREFIX = 'otasrc:';
const INDEX_KEY = 'otasrc:__index__';

export class SourceCache {
  private ttlMs: number;

  constructor(
    private storage: StorageBackend,
    ttlMs: number = 7 * 24 * 3600 * 1000,
  ) {
    this.ttlMs = ttlMs;
  }

  async getAsync(sourceId: string): Promise<CacheEntry | null> {
    try {
      const raw = await this.storage.get(PREFIX + sourceId);
      if (!raw) return null;
      const entry = JSON.parse(raw) as CacheEntry;
      if (Date.now() > entry.expiresAt) {
        await this.storage.remove(PREFIX + sourceId);
        return null;
      }
      return entry;
    } catch {
      return null;
    }
  }

  async set(sourceId: string, source: MangaSource): Promise<void> {
    const entry: CacheEntry = {
      sourceId,
      source,
      fetchedAt: Date.now(),
      expiresAt: Date.now() + this.ttlMs,
    };
    await this.storage.set(PREFIX + sourceId, JSON.stringify(entry));

    const ids = await this.getIds();
    if (!ids.includes(sourceId)) {
      ids.push(sourceId);
      await this.storage.set(INDEX_KEY, JSON.stringify(ids));
    }
  }

  async remove(sourceId: string): Promise<void> {
    await this.storage.remove(PREFIX + sourceId);
    const ids = (await this.getIds()).filter((id: string) => id !== sourceId);
    await this.storage.set(INDEX_KEY, JSON.stringify(ids));
  }

  async getIds(): Promise<string[]> {
    try {
      const raw = await this.storage.get(INDEX_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  async getAllSources(): Promise<MangaSource[]> {
    const ids = await this.getIds();
    const sources: MangaSource[] = [];
    for (const id of ids) {
      const entry = await this.getAsync(id);
      if (entry) sources.push(entry.source);
    }
    return sources;
  }

  async clear(): Promise<void> {
    const ids = await this.getIds();
    for (const id of ids) {
      await this.storage.remove(PREFIX + id);
    }
    await this.storage.remove(INDEX_KEY);
  }

  async count(): Promise<number> {
    return (await this.getIds()).length;
  }
}
