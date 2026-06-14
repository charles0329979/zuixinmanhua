// ============================================================
// packages/storage/src/db-interface.ts
// 数据库抽象端口 — 平台无关
// ============================================================

/** ★ 所有平台数据库适配器必须实现此接口 ★ */
export interface IDatabase {
  /** 执行写操作 (INSERT/UPDATE/DELETE/CREATE) */
  execute(sql: string, params?: unknown[]): Promise<void>;

  /** 查询多行 */
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;

  /** 查询单行 */
  queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | null>;

  /** 在事务中执行 */
  transaction<T>(fn: () => Promise<T>): Promise<T>;

  /** 关闭连接 */
  close(): Promise<void>;
}
