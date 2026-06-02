import { Controller, Get, Param } from '@nestjs/common';
import { ChapterService } from './chapter.service';

@Controller('chapter')
export class ChapterController {
  constructor(private readonly chapterService: ChapterService) {}

  /** GET /api/chapter/:source/:comicId/:chapterId — 章节图片 */
  @Get(':source/:comicId/:chapterId')
  async getImages(
    @Param('source') source: string,
    @Param('comicId') comicId: string,
    @Param('chapterId') chapterId: string,
  ) {
    return this.chapterService.getChapterImages(source, comicId, chapterId);
  }
}
