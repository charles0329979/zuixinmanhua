import { BaseAdapter } from './base.adapter';
import { ComicInfo, ChapterInfo, ChapterDetail, AdapterContext } from '../adapter.interface';

/**
 * 拷贝漫画书源适配器 — JSON API 模式
 */
export class CopyAdapter extends BaseAdapter {
  id = 'copy';
  name = '拷贝漫画';
  testTargets = { comicId: '123' };

  constructor(ctx: AdapterContext) { super(ctx); }

  async search(query: string): Promise<ComicInfo[]> {
    try {
      const { data: resp } = await this.fetch('/api/search', { params: { q: query, limit: 20 } });
      const json = typeof resp === 'string' ? JSON.parse(resp) : resp;
      return (json.results || json.data?.list || []).map((item: any) => ({
        comicId: String(item.id || item.comicId || ''),
        title: item.title || item.name || '未知',
        author: item.author || '未知',
        cover: item.cover || item.thumbnail || '',
        status: this.mapStatus(item.status),
        description: item.description || '',
        lastChapter: item.lastChapter || item.latestChapter || '',
        updatedAt: item.updatedAt || item.updateTime || '',
        source: this.id,
      }));
    } catch {
      return [];
    }
  }

  async getComicDetail(comicId: string): Promise<ComicInfo> {
    try {
      const { data: resp } = await this.fetch(`/api/comic/${comicId}`);
      const json = typeof resp === 'string' ? JSON.parse(resp) : resp;
      const item = json.data || json;
      return {
        comicId, title: item.title || '', author: item.author || '未知',
        cover: item.cover || '', status: this.mapStatus(item.status),
        description: item.description || '', lastChapter: item.lastChapter || '',
        updatedAt: item.updatedAt || '', source: this.id, tags: item.tags || [],
      };
    } catch {
      return { comicId, title: '', author: '', cover: '', status: 'ongoing', description: '', lastChapter: '', updatedAt: '', source: this.id };
    }
  }

  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    try {
      const { data: resp } = await this.fetch(`/api/comic/${comicId}/chapters`);
      const json = typeof resp === 'string' ? JSON.parse(resp) : resp;
      return (json.data?.list || json.chapters || []).map((item: any, i: number) => ({
        chapterId: String(item.id || item.chapterId || i),
        title: item.title || item.name || '', url: item.url || '', index: i,
      })).reverse();
    } catch { return []; }
  }

  async getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail> {
    const chapters = await this.getChapters(comicId);
    const idx = chapters.findIndex((c) => c.chapterId === chapterId);
    try {
      const { data: resp } = await this.fetch(`/api/chapter/${chapterId}`);
      const json = typeof resp === 'string' ? JSON.parse(resp) : resp;
      const images = (json.data?.images || json.images || []).map((img: any) => img.url || img);
      return {
        chapterId, comicTitle: '', chapterTitle: chapters[idx]?.title || '', images,
        prevChapter: idx > 0 ? { chapterId: chapters[idx - 1].chapterId, title: chapters[idx - 1].title } : undefined,
        nextChapter: idx < chapters.length - 1 ? { chapterId: chapters[idx + 1].chapterId, title: chapters[idx + 1].title } : undefined,
      };
    } catch { return { chapterId, comicTitle: '', chapterTitle: '', images: [] }; }
  }

  private mapStatus(status: string): 'ongoing' | 'completed' | 'hiatus' {
    if (status === 'completed' || status === '完结') return 'completed';
    return 'ongoing';
  }
}
