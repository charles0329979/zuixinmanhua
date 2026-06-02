import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import initSqlJs, { Database, SqlJsStatic } from 'sql.js';

/**
 * DatabaseService — 基于 sql.js (WASM) 的单文件 SQLite 数据库
 * 用于书源配置、健康状态、检测日志、搜索日志的持久化存储
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private SQL!: SqlJsStatic;
  private db!: Database;
  private readonly dbPath: string;
  private saveTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    const dbDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });
    this.dbPath = path.join(dbDir, 'comic-sources.db');
  }

  async onModuleInit() {
    this.SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new this.SQL.Database(buffer);
      this.logger.log(`📂 数据库已加载: ${this.dbPath}`);
    } else {
      this.db = new this.SQL.Database();
      this.logger.log(`🆕 数据库已创建`);
    }

    this.db.run('PRAGMA journal_mode=WAL;');
    this.db.run('PRAGMA foreign_keys=ON;');

    this.runMigrations();
    this.seedDefaults();

    this.saveTimer = setInterval(() => this.save(), 30000);
    this.save();
    this.logger.log('✅ 数据库初始化完成');
  }

  onModuleDestroy() {
    if (this.saveTimer) clearInterval(this.saveTimer);
    this.save();
    this.db.close();
    this.logger.log('📦 数据库已关闭');
  }

  // ==================== Public Query API ====================

  run(sql: string, params?: any[]): void {
    try {
      this.db.run(sql, params);
    } catch (e: any) {
      this.logger.error(`SQL Error: ${e.message}`);
      throw e;
    }
  }

  query<T = Record<string, any>>(sql: string, params?: any[]): T[] {
    try {
      const stmt = this.db.prepare(sql);
      if (params) stmt.bind(params);
      const rows: T[] = [];
      while (stmt.step()) rows.push(stmt.getAsObject() as T);
      stmt.free();
      return rows;
    } catch (e: any) {
      this.logger.error(`SQL Query Error: ${e.message}`);
      throw e;
    }
  }

  queryOne<T = Record<string, any>>(sql: string, params?: any[]): T | null {
    const rows = this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  /** Get the last insert rowid */
  lastInsertRowId(): number {
    const row = this.queryOne<{ id: number }>('SELECT last_insert_rowid() as id');
    return row?.id ?? 0;
  }

  save(): void {
    try {
      const data = this.db.export();
      fs.writeFileSync(this.dbPath, Buffer.from(data));
    } catch (e: any) {
      this.logger.error(`数据库保存失败: ${e.message}`);
    }
  }

  // ==================== Migrations ====================

  private runMigrations(): void {
    const schema = this.getMigrationSQL();

    // Split into individual statements, ignoring comment lines and empty strings
    const statements = schema
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    for (const stmt of statements) {
      try {
        this.db.run(stmt + ';');
      } catch (e: any) {
        if (!e.message?.includes('already exists')) {
          this.logger.warn(`迁移警告: ${e.message?.slice(0, 80)}`);
        }
      }
    }
    this.logger.log('📋 数据库迁移完成');
  }

  private seedDefaults(): void {
    const count = this.queryOne<{ cnt: number }>('SELECT COUNT(*) as cnt FROM source_configs');
    if (count && count.cnt > 0) {
      this.logger.log(`🌱 已有 ${count.cnt} 个书源配置`);
      return;
    }
    this.logger.log('🌱 插入默认书源配置...');
    this.run(this.getSeedSQL());
  }

  // ==================== Inline SQL ====================

  private getMigrationSQL(): string {
    return `
CREATE TABLE IF NOT EXISTS source_configs (
  source_id       TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  tier            TEXT NOT NULL DEFAULT 'core',
  enabled         INTEGER NOT NULL DEFAULT 1,
  request_config  TEXT NOT NULL DEFAULT '{}',
  test_targets    TEXT DEFAULT '{}',
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS source_domains (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id       TEXT NOT NULL REFERENCES source_configs(source_id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  priority        INTEGER NOT NULL DEFAULT 0,
  is_active       INTEGER NOT NULL DEFAULT 1,
  fail_count      INTEGER NOT NULL DEFAULT 0,
  success_count   INTEGER NOT NULL DEFAULT 0,
  avg_response_time_ms INTEGER DEFAULT NULL,
  last_check_at   TEXT,
  last_success_at TEXT,
  last_error      TEXT,
  note            TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS source_health_status (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id       TEXT NOT NULL REFERENCES source_configs(source_id) ON DELETE CASCADE,
  domain          TEXT,
  check_type      TEXT NOT NULL,
  is_healthy      INTEGER NOT NULL DEFAULT 0,
  status_code     INTEGER,
  response_time_ms INTEGER,
  error_type      TEXT,
  error_message   TEXT,
  last_check_at   TEXT,
  UNIQUE(source_id, check_type)
);

CREATE TABLE IF NOT EXISTS source_check_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id       TEXT NOT NULL,
  source_name     TEXT,
  domain          TEXT,
  check_type      TEXT NOT NULL,
  is_healthy      INTEGER NOT NULL DEFAULT 0,
  status_code     INTEGER,
  response_time_ms INTEGER,
  error_type      TEXT,
  error_message   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS source_search_logs (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id       TEXT NOT NULL,
  keyword         TEXT NOT NULL,
  is_success      INTEGER NOT NULL DEFAULT 1,
  result_count    INTEGER NOT NULL DEFAULT 0,
  response_time_ms INTEGER,
  error_message   TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_check_logs_source ON source_check_logs(source_id, created_at);
CREATE INDEX IF NOT EXISTS idx_search_logs_created ON source_search_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_health_status_source ON source_health_status(source_id);
`;
  }

  private getSeedSQL(): string {
    const reqCfg = JSON.stringify({
      timeout: 10000,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      retries: 2,
    });
    const suppCfg = JSON.stringify({ ...JSON.parse(reqCfg), timeout: 15000, retries: 3 });

    return `
INSERT OR IGNORE INTO source_configs (source_id, name, tier, request_config) VALUES ('copy', '拷贝漫画', 'core', '${reqCfg}');
INSERT OR IGNORE INTO source_domains (source_id, url, priority, is_active, note) VALUES ('copy', 'https://www.mangacopy.com', 0, 1, '主域名');
INSERT OR IGNORE INTO source_domains (source_id, url, priority, is_active, note) VALUES ('copy', 'https://copymanga.tv', 1, 1, '备用域名');

INSERT OR IGNORE INTO source_configs (source_id, name, tier, request_config) VALUES ('baozi', '包子漫画', 'core', '${reqCfg}');
INSERT OR IGNORE INTO source_domains (source_id, url, priority, is_active, note) VALUES ('baozi', 'https://www.baozimh.com', 0, 1, '主域名');

INSERT OR IGNORE INTO source_configs (source_id, name, tier, request_config) VALUES ('dongmanzhijia', '动漫之家', 'core', '${reqCfg}');
INSERT OR IGNORE INTO source_domains (source_id, url, priority, is_active, note) VALUES ('dongmanzhijia', 'https://www.dmzj.com', 0, 1, '主域名');

INSERT OR IGNORE INTO source_configs (source_id, name, tier, request_config) VALUES ('manwa', '漫蛙', 'supplement', '${suppCfg}');
INSERT OR IGNORE INTO source_domains (source_id, url, priority, is_active, note) VALUES ('manwa', 'https://manwa.com', 0, 1, '主域名');

INSERT OR IGNORE INTO source_configs (source_id, name, tier, request_config) VALUES ('yeman', '野蛮漫画', 'supplement', '${suppCfg}');
INSERT OR IGNORE INTO source_domains (source_id, url, priority, is_active, note) VALUES ('yeman', 'https://www.yemancomic.com', 0, 1, '主域名');
`;
  }
}
