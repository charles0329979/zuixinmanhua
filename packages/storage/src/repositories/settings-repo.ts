// ============================================================
// packages/storage/src/repositories/settings-repo.ts
// 应用设置 Repository (key-value)
// ============================================================

import type { IDatabase } from '../db-interface';
import type { AppSettings } from '@zuixinmanhua/types';

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  brightness: 100,
  defaultSourceFilter: [],
  imageCacheMaxMb: 200,
  readerMode: 'long-strip',
  autoNextChapter: true,
};

export class SettingsRepository {
  constructor(private db: IDatabase) {}

  async get(key: string): Promise<string | null> {
    const r = await this.db.queryOne<{ value: string }>(
      'SELECT value FROM settings WHERE key = ?',
      [key],
    );
    return r?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await this.db.execute(
      `INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)`,
      [key, value],
    );
  }

  async getJson<T = unknown>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown): Promise<void> {
    await this.set(key, JSON.stringify(value));
  }

  // ---- Convenience methods for AppSettings ----

  async getAppSettings(): Promise<AppSettings> {
    const raw = await this.getJson<Partial<AppSettings>>('app_settings');
    return { ...DEFAULT_SETTINGS, ...raw };
  }

  async updateAppSettings(
    partial: Partial<AppSettings>,
  ): Promise<void> {
    const current = await this.getAppSettings();
    const merged = { ...current, ...partial };
    await this.setJson('app_settings', merged);
  }

  async getAllRaw(): Promise<Record<string, string>> {
    const rows = await this.db.query<{ key: string; value: string }>(
      'SELECT key, value FROM settings',
    );
    const obj: Record<string, string> = {};
    for (const row of rows) {
      obj[row.key] = row.value;
    }
    return obj;
  }
}
