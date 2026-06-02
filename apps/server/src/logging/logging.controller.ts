import { Controller, Get, Query } from '@nestjs/common';
import { LoggingService } from './logging.service';

@Controller('logs')
export class LoggingController {
  constructor(private readonly loggingService: LoggingService) {}

  /** GET /api/logs/checks?source=xxx&limit=50 */
  @Get('checks')
  getCheckLogs(@Query('source') source?: string, @Query('limit') limit?: string) {
    return this.loggingService.getCheckLogs({
      source,
      limit: limit ? parseInt(limit) : 50,
    });
  }

  /** GET /api/logs/searches?limit=50 */
  @Get('searches')
  getSearchLogs(@Query('limit') limit?: string) {
    return this.loggingService.getSearchLogs({
      limit: limit ? parseInt(limit) : 50,
    });
  }
}
