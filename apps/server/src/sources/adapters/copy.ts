import axios from 'axios';
import * as cheerio from 'cheerio';
import { SourceAdapter, ComicInfo, ChapterInfo, ChapterDetail } from '../adapter.interface';

/**
 * 拷贝漫画书源适配器
 */
export class CopyAdapter implements SourceAdapter {
  id = 'copy';
  name = '拷贝漫画';
  domain = 'https://www.mangacopy.com';

  private baseUrl = 'https://www.mangacopy.com';

  async search(query: string): Promise<ComicInfo[]> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/api/search`, {
        params: { q: query, limit: 20 },
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      // 尝试 JSON API 解析
      const json = JSON.parse(data);
      return (json.results || json.data?.list || []).map((item: any) => ({
        comicId: item.id || item.comicId || '',
        title: item.title || item.name || '',
        author: item.author || '未知',
        cover: item.cover || item.thumbnail || '',
        status: this.mapStatus(item.status),
        description: item.description || '',
        lastChapter: item.lastChapter || item.latestChapter || '',
        updatedAt: item.updatedAt || item.updateTime || '',
        source: this.id,
      }));
    } catch {
      // API 失败时回退到 HTML 解析
      return [];
    }
  }

  async getComicDetail(comicId: string): Promise<ComicInfo> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/api/comic/${comicId}`, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const json = JSON.parse(data);
      const item = json.data || json;
      return {
        comicId,
        title: item.title || '',
        author: item.author || '未知',
        cover: item.cover || '',
        status: this.mapStatus(item.status),
        description: item.description || '',
        lastChapter: item.lastChapter || '',
        updatedAt: item.updatedAt || '',
        source: this.id,
        tags: item.tags || [],
      };
    } catch {
      return { comicId, title: '', author: '', cover: '', status: 'ongoing', description: '', lastChapter: '', updatedAt: '', source: this.id };
    }
  }

  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/api/comic/${comicId}/chapters`, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const json = JSON.parse(data);
      const list = json.data?.list || json.chapters || [];
      return list.map((item: any, i: number) => ({
        chapterId: item.id || item.chapterId || String(i),
        title: item.title || item.name || '',
        url: item.url || '',
        index: i,
      })).reverse();
    } catch {
      return [];
    }
  }

  async getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail> {
    const chapters = await this.getChapters(comicId);
    const idx = chapters.findIndex((c) => c.chapterId === chapterId);

    try {
      const { data } = await axios.get(`${this.baseUrl}/api/chapter/${chapterId}`, {
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const json = JSON.parse(data);
      const images = (json.data?.images || json.images || []).map((img: any) => img.url || img);

      return {
        chapterId,
        comicTitle: '',
        chapterTitle: chapters[idx]?.title || '',
        images,
        prevChapter: idx > 0 ? { chapterId: chapters[idx - 1].chapterId, title: chapters[idx - 1].title } : undefined,
        nextChapter: idx < chapters.length - 1 ? { chapterId: chapters[idx + 1].chapterId, title: chapters[idx + 1].title } : undefined,
      };
    } catch {
      return { chapterId, comicTitle: '', chapterTitle: '', images: [] };
    }
  }

  private mapStatus(status: string): 'ongoing' | 'completed' | 'hiatus' {
    if (status === 'completed' || status === '完结') return 'completed';
    return 'ongoing';
  }
}
