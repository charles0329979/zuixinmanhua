import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class LoggingService {
  constructor(private readonly db: DatabaseService) {}

  getCheckLogs(params: { source?: string; limit?: number; offset?: number }) {
    let sql = 'SELECT * FROM source_check_logs WHERE 1=1';
    const args: any[] = [];
    if (params.source) { sql += ' AND source_id = ?'; args.push(params.source); }
    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    args.push(params.limit || 50, params.offset || 0);
    return this.db.query(sql, args);
  }

  getSearchLogs(params: { limit?: number; offset?: number }) {
    const sql = 'SELECT * FROM source_search_logs ORDER BY created_at DESC LIMIT ? OFFSET ?';
    return this.db.query(sql, [params.limit || 50, params.offset || 0]);
  }
}
