// ============================================================
// packages/storage/src/repositories/progress-repo.ts
// 阅读进度 Repository
// ============================================================

import type { IDatabase } from '../db-interface';
import type { ReadingProgress } from '@zuixinmanhua/types';

export class ProgressRepository {
  constructor(private db: IDatabase) {}

  async getAll(): Promise<ReadingProgress[]> {
    return this.db.query<ReadingProgress>(
      'SELECT * FROM reading_progress ORDER BY last_read_at DESC',
    );
  }

  async getById(id: string): Promise<ReadingProgress | null> {
    return this.db.queryOne<ReadingProgress>(
      'SELECT * FROM reading_progress WHERE id = ?',
      [id],
    );
  }

  async getBySourceComic(
    source: string,
    comicId: string,
  ): Promise<ReadingProgress | null> {
    const id = `${source}:${comicId}`;
    return this.getById(id);
  }

  async upsert(progress: {
    comicId: string;
    comicTitle: string;
    source: string;
    chapterId: string;
    chapterTitle?: string;
    pageIndex: number;
    cover?: string;
  }): Promise<void> {
    const id = `${progress.source}:${progress.comicId}`;
    const now = Date.now();
    await this.db.execute(
      `INSERT OR REPLACE INTO reading_progress
       (id, comic_id, comic_title, source, chapter_id, chapter_title, page_index, cover, last_read_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        progress.comicId,
        progress.comicTitle,
        progress.source,
        progress.chapterId,
        progress.chapterTitle || null,
        progress.pageIndex,
        progress.cover || null,
        now,
      ],
    );
  }

  async remove(id: string): Promise<void> {
    await this.db.execute('DELETE FROM reading_progress WHERE id = ?', [id]);
  }

  async getRecentReading(limit = 10): Promise<ReadingProgress[]> {
    return this.db.query<ReadingProgress>(
      'SELECT * FROM reading_progress ORDER BY last_read_at DESC LIMIT ?',
      [limit],
    );
  }
}
