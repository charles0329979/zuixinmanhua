// ============================================================
// source-platform/registry/source-version.service.ts
// SourceVersionService — 源版本号 + SHA256 hash 生成
// ============================================================

import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

@Injectable()
export class SourceVersionService {
  /** 生成版本号: 1.0.0-{hash前8位} */
  generateVersion(content: string): string {
    return '1.0.0-' + this.hash(content).slice(0, 8);
  }

  /** 计算 SHA-256 */
  hash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  /** 为驱动生成稳定源条目所需的 source content */
  buildSourceContent(driverId: string, driverName: string, host: string): string {
    return JSON.stringify({ id: driverId, name: driverName, host });
  }
}
