import axios from 'axios';
import * as cheerio from 'cheerio';
import { SourceAdapter, ComicInfo, ChapterInfo, ChapterDetail } from '../adapter.interface';

/**
 * 漫蛙书源适配器
 * 搜索 + 详情 + 章节 + 图片解析
 */
export class ManwaAdapter implements SourceAdapter {
  id = 'manwa';
  name = '漫蛙';
  domain = 'https://manwa.com';

  private baseUrl = 'https://manwa.com';

  async search(query: string): Promise<ComicInfo[]> {
    try {
      const { data } = await axios.get(`${this.baseUrl}/search`, {
        params: { q: query },
        timeout: 10000,
        headers: { 'User-Agent': 'Mozilla/5.0' },
      });
      const $ = cheerio.load(data);
      const results: ComicInfo[] = [];

      $('.comic-item, .search-result, .item').each((_, el) => {
        const $el = $(el);
        const link = $el.find('a').first().attr('href') || '';
        results.push({
          comicId: link.replace(/\/comic\//, '').replace(/\//g, ''),
          title: $el.find('.title, h3, .name').first().text().trim(),
          author: $el.find('.author, .artist').first().text().trim() || '未知',
          cover: $el.find('img').first().attr('src') || '',
          status: 'ongoing',
          description: '',
          lastChapter: $el.find('.chapter, .latest').first().text().trim(),
          updatedAt: $el.find('.date, .update').first().text().trim(),
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
      title: $('h1, .comic-title').first().text().trim(),
      author: $('.author').first().text().trim() || '未知',
      cover: $('.cover img, .comic-cover img').first().attr('src') || '',
      status: 'ongoing',
      description: $('.desc, .description').first().text().trim(),
      lastChapter: $('.chapter-item').last().find('a').text().trim(),
      updatedAt: $('.update-date').first().text().trim(),
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

    $('.chapter-item, .chapter-list a, .chapters a').each((i, el) => {
      const $el = $(el);
      chapters.push({
        chapterId: ($el.attr('href') || '').replace(/\/chapter\//, '').replace(/\//g, ''),
        title: $el.text().trim(),
        url: $el.attr('href') || '',
        index: i,
      });
    });
    return chapters.reverse(); // 最新在前
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
    $('.comic-image img, .chapter-content img, img.comic-page').each((_, el) => {
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
}
