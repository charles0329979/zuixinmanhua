// ============================================================
// packages/storage/src/repositories/history-repo.ts
// 浏览历史 Repository
// ============================================================

import type { IDatabase } from '../db-interface';
import type { BrowseHistoryItem } from '@zuixinmanhua/types';

export class HistoryRepository {
  constructor(private db: IDatabase) {}

  async getAll(limit = 100): Promise<BrowseHistoryItem[]> {
    return this.db.query<BrowseHistoryItem>(
      'SELECT * FROM browse_history ORDER BY last_read_at DESC LIMIT ?',
      [limit],
    );
  }

  async add(item: {
    comicId: string;
    title: string;
    source: string;
    cover?: string;
    chapterTitle?: string;
    chapterUrl?: string;
    pageIndex?: number;
  }): Promise<void> {
    const id = `${item.source}:${item.comicId}:${Date.now()}`;
    await this.db.execute(
      `INSERT INTO browse_history
       (id, comic_id, title, source, cover, chapter_title, chapter_url, page_index, last_read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        item.comicId,
        item.title,
        item.source,
        item.cover || null,
        item.chapterTitle || null,
        item.chapterUrl || null,
        item.pageIndex || 0,
        Date.now(),
      ],
    );
  }

  async remove(id: string): Promise<void> {
    await this.db.execute('DELETE FROM browse_history WHERE id = ?', [id]);
  }

  async clearAll(): Promise<void> {
    await this.db.execute('DELETE FROM browse_history');
  }

  async count(): Promise<number> {
    const r = await this.db.queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM browse_history',
    );
    return r?.cnt ?? 0;
  }
}
