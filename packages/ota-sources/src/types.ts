import type { MangaSource } from '@zuixinmanhua/types';

export interface RegistryManifest {
  name: string;
  version: string;
  updatedAt: string;
  sourceCount: number;
  minClientVersion: string;
  /** URL to full index.json */
  indexUrl: string;
}

export interface RegistryIndex {
  version: string;
  updatedAt: string;
  sources: RegistrySourceEntry[];
}

export interface RegistrySourceEntry {
  id: string;
  name: string;
  host: string;
  version: string;
  language: string;
  weight: number;
  riskLevel: 'low' | 'medium' | 'high';
  enabledByDefault: boolean;
  /** URL to individual source JSON file */
  url: string;
}

export interface SyncResult {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
  total: number;
  errors: string[];
}

export interface CacheEntry {
  sourceId: string;
  source: MangaSource;
  fetchedAt: number;
  expiresAt: number;
  etag?: string;
}
