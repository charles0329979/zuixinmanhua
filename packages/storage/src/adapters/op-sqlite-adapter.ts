// ============================================================
// packages/storage/src/adapters/op-sqlite-adapter.ts
// OpSqliteAdapter — React Native (op-sqlite) stub
// 实际实现需在 apps/mobile 中使用 @op-engineering/op-sqlite
// ============================================================

import type { IDatabase } from '../db-interface';

/**
 * OpSqliteAdapter — React Native 端 SQLite
 *
 * 使用 @op-engineering/op-sqlite (native performance)
 * 在 Expo SDK 52+ 中通过 expo-sqlite 替代
 *
 * 本文件为接口桩，实际初始化在 apps/mobile/src/database/ 中完成
 */
export class OpSqliteAdapter implements IDatabase {
  private db: unknown | null = null;
  private name: string;

  constructor(name: string = 'comic-reader.db') {
    this.name = name;
  }

  async initialize(): Promise<void> {
    if (this.db) return;
    // RN 端实际实现:
    // import { open } from '@op-engineering/op-sqlite';
    // this.db = open({ name: this.name });
    throw new Error(
      'OpSqliteAdapter not yet wired. Import @op-engineering/op-sqlite in apps/mobile.',
    );
  }

  async execute(_sql: string, _params: unknown[] = []): Promise<void> {
    await this.initialize();
    // (this.db as OPSqliteDB).execute(sql, params);
    throw new Error('Not implemented — wire op-sqlite in apps/mobile');
  }

  async query<T = Record<string, unknown>>(
    _sql: string,
    _params: unknown[] = [],
  ): Promise<T[]> {
    await this.initialize();
    throw new Error('Not implemented — wire op-sqlite in apps/mobile');
  }

  async queryOne<T = Record<string, unknown>>(
    _sql: string,
    _params: unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(_sql, _params);
    return rows.length > 0 ? rows[0] : null;
  }

  async transaction<T>(_fn: () => Promise<T>): Promise<T> {
    await this.initialize();
    throw new Error('Not implemented — wire op-sqlite in apps/mobile');
  }

  async close(): Promise<void> {
    if (this.db) {
      // (this.db as OPSqliteDB).close();
      this.db = null;
    }
  }
}
