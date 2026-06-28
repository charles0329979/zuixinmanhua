// ============================================================
// SourceSyncer — incremental sync with server
// ============================================================

import type { IHttpClient } from '@zuixinmanhua/network';
import type { MangaSource } from '@zuixinmanhua/types';
import { SourceRegistry } from './registry';
import { SourceCache } from './cache';
import { validateSource } from './validator';
import type { SyncResult } from './types';

export class SourceSyncer {
  private registry: SourceRegistry;

  constructor(
    private http: IHttpClient,
    private cache: SourceCache,
    serverUrl: string,
  ) {
    this.registry = new SourceRegistry(http, serverUrl);
  }

  /** Full sync: fetch manifest → compare versions → download new/updated sources */
  async sync(): Promise<SyncResult> {
    const result: SyncResult = { added: 0, updated: 0, removed: 0, unchanged: 0, total: 0, errors: [] };

    try {
      const manifest = await this.registry.fetchManifest();
      const index = await this.registry.fetchIndex(manifest.indexUrl);

      const localIds = await this.cache.getIds();
      const localIdSet = new Set(localIds);
      const remoteIds = new Set<string>();

      for (const entry of index.sources) {
        remoteIds.add(entry.id);

        const cached = await this.cache.getAsync(entry.id);
        if (cached && cached.source.updatedAt === entry.version) {
          result.unchanged++;
        } else {
          try {
            const raw = await this.registry.fetchSource(entry.url);
            const source = raw as unknown as MangaSource;
            if (!validateSource(source)) {
              result.errors.push(`${entry.id}: validation failed`);
              continue;
            }
            this.cache.set(entry.id, source);
            if (cached) result.updated++;
            else result.added++;
          } catch (e: any) {
            result.errors.push(`${entry.id}: ${e.message}`);
          }
        }
      }

      // Remove sources not in remote
      for (const id of localIdSet) {
        if (!remoteIds.has(id)) {
          this.cache.remove(id);
          result.removed++;
        }
      }

      result.total = index.sources.length;
    } catch (e: any) {
      result.errors.push(`sync failed: ${e.message}`);
    }

    return result;
  }

  /** Quick check: only fetch manifest, return true if update available */
  async isUpdateAvailable(lastVersion: string): Promise<boolean> {
    try {
      const manifest = await this.registry.fetchManifest();
      return manifest.version !== lastVersion;
    } catch {
      return false;
    }
  }
}
