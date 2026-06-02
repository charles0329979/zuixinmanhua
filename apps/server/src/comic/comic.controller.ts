import { Controller, Get, Param } from '@nestjs/common';
import { ComicService } from './comic.service';

@Controller('comic')
export class ComicController {
  constructor(private readonly comicService: ComicService) {}

  /** GET /api/comic/:source/:comicId — 漫画详情 */
  @Get(':source/:comicId')
  async getDetail(@Param('source') source: string, @Param('comicId') comicId: string) {
    return this.comicService.getComicDetail(source, comicId);
  }

  /** GET /api/comic/:source/:comicId/chapters — 章节列表 */
  @Get(':source/:comicId/chapters')
  async getChapters(@Param('source') source: string, @Param('comicId') comicId: string) {
    return this.comicService.getChapters(source, comicId);
  }
}
