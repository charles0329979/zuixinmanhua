// ============================================================
// packages/storage/src/adapters/sqljs-adapter.ts
// SqljsAdapter — Server 端 sql.js (WASM SQLite)
// ============================================================

import type { IDatabase } from '../db-interface';

export class SqljsAdapter implements IDatabase {
  private db: unknown;
  private loaded = false;

  // sql.js 需要异步加载 WASM，需在 Server 端注入
  constructor(
    private initFn: () => Promise<unknown>,
  ) {}

  async initialize(): Promise<void> {
    if (this.loaded) return;
    this.db = await this.initFn();
    this.loaded = true;
  }

  async execute(sql: string, params: unknown[] = []): Promise<void> {
    await this.initialize();
    (this.db as { run: (s: string, p?: unknown[]) => void }).run(sql, params);
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    await this.initialize();
    // sql.js: db.exec returns array of {columns, values}
    const db = this.db as {
      exec: (sql: string, params?: unknown[]) => Array<{
        columns: string[];
        values: unknown[][];
      }>;
    };

    // Bind params into SQL (sql.js exec uses prepared statements internally)
    const stmt = (this.db as { prepare: (s: string) => { bind: (p: unknown[]) => void; step: () => boolean; getAsObject: () => Record<string, unknown>; free: () => void } }).prepare(sql);
    stmt.bind(params);

    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return rows;
  }

  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    await this.initialize();
    await this.execute('BEGIN');
    try {
      const result = await fn();
      await this.execute('COMMIT');
      return result;
    } catch (e) {
      await this.execute('ROLLBACK');
      throw e;
    }
  }

  async close(): Promise<void> {
    if (this.loaded && this.db) {
      (this.db as { close: () => void }).close();
      this.loaded = false;
    }
  }
}
