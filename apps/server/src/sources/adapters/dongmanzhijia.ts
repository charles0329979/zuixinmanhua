import axios from 'axios';
import * as cheerio from 'cheerio';
import { SourceAdapter, ComicInfo, ChapterInfo, ChapterDetail } from '../adapter.interface';

/**
 * 动漫之家书源适配器
 */
export class DongmanZhijiaAdapter implements SourceAdapter {
  id = 'dongmanzhijia';
  name = '动漫之家';
  domain = 'https://www.dmzj.com';

  private baseUrl = 'https://www.dmzj.com';

  async search(query: string): Promise<ComicInfo[]> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/search`, {
        params: { keyword: query },
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const $ = cheerio.load(data);
      const results: ComicInfo[] = [];

      $('.cartoon-item, .search-result-item, .comic-item').each((_, el) => {
        const $el = $(el);
        const link = $el.find('a').first().attr('href') || '';
        results.push({
          comicId: this.extractId(link),
          title: $el.find('.cartoon-title, .title, h3').first().text().trim(),
          author: $el.find('.author').first().text().trim() || '未知',
          cover: $el.find('img').first().attr('src') || '',
          status: 'ongoing',
          description: '',
          lastChapter: $el.find('.chapter, .latest').first().text().trim(),
          updatedAt: $el.find('.date, .update-time').first().text().trim(),
          source: this.id,
        });
      });
      return results;
    } catch {
      return [];
    }
  }

  async getComicDetail(comicId: string): Promise<ComicInfo> {
    const { data } = await axios.get(`${this.baseUrl}/info/${comicId}.html`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const $ = cheerio.load(data);
    return {
      comicId,
      title: $('.comic-title, h1').first().text().trim(),
      author: $('.author').first().text().trim() || '未知',
      cover: $('.comic-cover img, .cover img').first().attr('src') || '',
      status: this.parseStatus($('.status-text').first().text().trim()),
      description: $('.comic-description, .desc').first().text().trim(),
      lastChapter: $('.chapter-item').last().find('a').text().trim(),
      updatedAt: $('.update-date').first().text().trim(),
      source: this.id,
      tags: $('.tag').map((_, el) => $(el).text().trim()).get(),
    };
  }

  async getChapters(comicId: string): Promise<ChapterInfo[]> {
    const { data } = await axios.get(`${this.baseUrl}/info/${comicId}.html`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const $ = cheerio.load(data);
    const chapters: ChapterInfo[] = [];

    $('.chapter-item a, .chapter-list a, .tab-content a').each((i, el) => {
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

    const { data } = await axios.get(`${this.baseUrl}/view/${chapterId}.html`, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    const $ = cheerio.load(data);
    const images: string[] = [];
    $('.comicpage img, .chapter-content img, #comic-images img').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
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
    return url.replace(/\/info\//, '').replace(/\/view\//, '').replace(/\.html/, '').replace(/\//g, '');
  }

  private parseStatus(text: string): 'ongoing' | 'completed' | 'hiatus' {
    if (text.includes('完结') || text.includes('完結')) return 'completed';
    if (text.includes('停更')) return 'hiatus';
    return 'ongoing';
  }
}
