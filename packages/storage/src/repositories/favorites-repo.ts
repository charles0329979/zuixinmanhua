// ============================================================
// packages/storage/src/repositories/favorites-repo.ts
// 收藏 Repository
// ============================================================

import type { IDatabase } from '../db-interface';
import type { FavoriteComic } from '@zuixinmanhua/types';

export class FavoritesRepository {
  constructor(private db: IDatabase) {}

  async getAll(
    sortBy: 'added' | 'title' = 'added',
  ): Promise<FavoriteComic[]> {
    const orderBy =
      sortBy === 'added' ? 'added_at DESC' : 'title ASC';
    return this.db.query<FavoriteComic>(
      `SELECT * FROM favorites ORDER BY ${orderBy}`,
    );
  }

  async getById(id: string): Promise<FavoriteComic | null> {
    return this.db.queryOne<FavoriteComic>(
      'SELECT * FROM favorites WHERE id = ?',
      [id],
    );
  }

  async add(
    comic: Omit<FavoriteComic, 'id' | 'addedAt' | 'createdAt' | 'updatedAt'>,
  ): Promise<void> {
    const id = `${comic.source}:${comic.comicId}`;
    await this.db.execute(
      `INSERT OR REPLACE INTO favorites
       (id, comic_id, title, author, cover, source, last_chapter, status, added_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        comic.comicId,
        comic.title,
        comic.author || null,
        comic.cover || null,
        comic.source,
        comic.lastChapter || null,
        comic.status || 'ongoing',
        Date.now(),
      ],
    );
  }

  async remove(id: string): Promise<void> {
    await this.db.execute('DELETE FROM favorites WHERE id = ?', [id]);
  }

  async removeBySourceComic(
    source: string,
    comicId: string,
  ): Promise<void> {
    const id = `${source}:${comicId}`;
    await this.remove(id);
  }

  async isFavorite(source: string, comicId: string): Promise<boolean> {
    const id = `${source}:${comicId}`;
    const r = await this.db.queryOne<{ id: string }>(
      'SELECT id FROM favorites WHERE id = ?',
      [id],
    );
    return r !== null;
  }

  async search(title: string): Promise<FavoriteComic[]> {
    return this.db.query<FavoriteComic>(
      'SELECT * FROM favorites WHERE title LIKE ? ORDER BY added_at DESC',
      [`%${title}%`],
    );
  }

  async count(): Promise<number> {
    const r = await this.db.queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM favorites',
    );
    return r?.cnt ?? 0;
  }
}
