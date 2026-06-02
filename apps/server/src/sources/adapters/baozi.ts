import axios from 'axios';
import * as cheerio from 'cheerio';
import { SourceAdapter, ComicInfo, ChapterInfo, ChapterDetail } from '../adapter.interface';

/**
 * 包子漫画书源适配器
 */
export class BaoziAdapter implements SourceAdapter {
  id = 'baozi';
  name = '包子漫画';
  domain = 'https://www.baozimh.com';

  private baseUrl = 'https://www.baozimh.com';

  async search(query: string): Promise<ComicInfo[]> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/search`, {
        params: { q: query },
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const $ = cheerio.load(data);
      const results: ComicInfo[] = [];

      $('.comics-card, .search-item, .item-card').each((_, el) => {
        const $el = $(el);
        const link = $el.find('a').first().attr('href') || '';
        results.push({
          comicId: this.extractId(link),
          title: $el.find('.comics-title, .title, .name').first().text().trim(),
          author: $el.find('.author, .artist').first().text().trim() || '未知',
          cover: $el.find('img').first().attr('src') || '',
          status: 'ongoing',
          description: '',
          lastChapter: $el.find('.chapter, .latest-chapter').first().text().trim(),
          updatedAt: $el.find('.update, .time').first().text().trim(),
          source: this.id,
        });
      });
      return results;
    } catch {
      return [];
    }
  }

  async getComicDetail(comicId: string): Promise<ComicInfo> {
    const { data } = await axios.get(`${this.baseUrl}/comic/${comicId}`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const $ = cheerio.load(data);
    return {
      comicId,
      title: $('h1, .detail-title, .comic-title').first().text().trim(),
      author: $('.author').first().text().trim() || '未知',
      cover: $('.detail-cover img, .comic-cover img').first().attr('src') || '',
      status: this.parseStatus($('.status').first().text().trim()),
      description: $('.description, .desc, .intro').first().text().trim(),
      lastChapter: $('.chapter-item').last().find('a').text().trim(),
      updatedAt: $('.update-time').first().text().trim(),
      source: this.id,
    };
  }

  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    const { data } = await axios.get(`${this.baseUrl}/comic/${comicId}`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const $ = cheerio.load(data);
    const chapters: ChapterInfo[] = [];

    $('.chapter-item a, .chapters a, #chapter-list a').each((i, el) => {
      const $el = $(el);
      chapters.push({
        chapterId: this.extractId($el.attr('href') || ''),
        title: $el.text().trim(),
        url: $el.attr('href') || '',
        index: i,
      });
    });
    return chapters.reverse();
  }

  async getChapterImages(comicId: string, chapterId: string): Promise<ChapterDetail> {
    const chapters = await this.getChapters(comicId);
    const idx = chapters.findIndex((c) => c.chapterId === chapterId);

    const { data } = await axios.get(`${this.baseUrl}/chapter/${chapterId}`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const $ = cheerio.load(data);
    const images: string[] = [];
    $('.comic-content img, .chapter-img img, img.comic-image').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src') || $(el).attr('data-original');
      if (src) images.push(src);
    });

    return {
      chapterId,
      comicTitle: '',
      chapterTitle: chapters[idx]?.title || '',
      images,
      prevChapter: idx > 0 ? { chapterId: chapters[idx - 1].chapterId, title: chapters[idx - 1].title } : undefined,
      nextChapter: idx < chapters.length - 1 ? { chapterId: chapters[idx + 1].chapterId, title: chapters[idx + 1].title } : undefined,
    };
  }

  private extractId(url: string): string {
    return url.replace(/\/comic\//, '').replace(/\/chapter\//, '').replace(/\//g, '');
  }

  private parseStatus(text: string): 'ongoing' | 'completed' | 'hiatus' {
    if (text.includes('完结')) return 'completed';
    if (text.includes('停更')) return 'hiatus';
    return 'ongoing';
  }
}
