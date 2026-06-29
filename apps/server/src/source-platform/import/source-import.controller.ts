// ============================================================
// source-platform/import/source-import.controller.ts
// Import Admin API — 已知仓库同步 + 本地文件导入 (V10)
//
// 只支持:
//   POST /api/admin/source-import/repositories/:id/sync
//   POST /api/admin/source-import/import-file
//
// 不做: GitHub 自动搜索、全网搜索、自动收录
// 不写: stable、OTA
// ============================================================

import { Controller, Get, Post, Param, Body, Logger } from '@nestjs/common';
import { SourceImportService } from './source-import.service';

@Controller('admin/source-import')
export class SourceImportController {
  private readonly logger = new Logger(SourceImportController.name);

  constructor(private readonly importService: SourceImportService) {}

  /** GET /api/admin/source-import/repositories */
  @Get('repositories')
  getRepositories() {
    return this.importService.getRepositories();
  }

  /** POST /api/admin/source-import/repositories/:id/sync */
  @Post('repositories/:id/sync')
  async syncRepository(@Param('id') id: string) {
    const result = await this.importService.syncRepository(id);
    return result;
  }

  /** POST /api/admin/source-import/import-file */
  @Post('import-file')
  async importFile(@Body() body: { filePath: string }) {
    return this.importService.importLocalFile(body.filePath);
  }
}
