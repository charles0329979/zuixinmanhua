// ============================================================
// SourceRegistry — fetch manifest + index from server
// ============================================================

import type { IHttpClient } from '@zuixinmanhua/network';
import type { RegistryManifest, RegistryIndex } from './types';

export class SourceRegistry {
  constructor(
    private http: IHttpClient,
    private baseUrl: string,
  ) {}

  /** Fetch the registry manifest */
  async fetchManifest(): Promise<RegistryManifest> {
    const res = await this.http.get(`${this.baseUrl}/manifest.json`);
    return (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) as RegistryManifest;
  }

  /** Fetch the full source index */
  async fetchIndex(indexUrl?: string): Promise<RegistryIndex> {
    const url = indexUrl || `${this.baseUrl}/index.json`;
    const res = await this.http.get(url.startsWith('http') ? url : `${this.baseUrl}/${url}`);
    return (typeof res.data === 'string' ? JSON.parse(res.data) : res.data) as RegistryIndex;
  }

  /** Fetch a single source definition by URL */
  async fetchSource(url: string): Promise<Record<string, unknown>> {
    const fullUrl = url.startsWith('http') ? url : `${this.baseUrl}/${url}`;
    const res = await this.http.get(fullUrl);
    return typeof res.data === 'string' ? JSON.parse(res.data) : (res.data as Record<string, unknown>);
  }
}
