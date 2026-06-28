// ============================================================
// apps/server/src/modules/source-import/remote-repository/repository-mirror.service.ts
// 本地镜像 — 保存原始快照 + SHA256 hash + commit SHA 去重
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { RepositoryClientService, FetchResult } from './github-repository-client.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface MirrorSnapshot {
  /** 文件在镜像中的路径 */
  localPath: string;
  /** 原始文件 SHA256 hash */
  rawHash: string;
  /** 文件内容 (原始字符串) */
  content: string;
  /** 文件大小 */
  size: number;
  /** 下载来源 URL */
  sourceUrl: string;
}

export interface MirrorManifest {
  repositoryId: string;
  repositoryUrl: string;
  branch: string;
  commitSha: string;
  importedAt: string;
  files: {
    sourceUrl: string;
    localPath: string;
    rawHash: string;
    size: number;
  }[];
}

@Injectable()
export class RepositoryMirrorService {
  private readonly logger = new Logger(RepositoryMirrorService.name);
  private readonly registryRoot: string;

  constructor(private readonly client: RepositoryClientService) {
    this.registryRoot = path.join(process.cwd(), 'data', 'source-registry');
  }

  /**
   * 镜像单个文件到本地快照目录
   *
   * @param repositoryId  仓库 ID
   * @param provider      来源类型 (github/pipimiao/legado/comicfs)
   * @param commitSha     当前 commit SHA
   * @param sourceUrl     源文件 URL
   * @param fileName      文件名 (用于本地存储)
   * @returns 镜像快照，如果 hash 已存在则返回 null (跳过)
   */
  async mirrorFile(
    repositoryId: string,
    provider: string,
    commitSha: string,
    sourceUrl: string,
    fileName?: string,
    raw: boolean = false,
  ): Promise<MirrorSnapshot | null> {
    // 1. 拉取文件 (raw=true 用于二进制文件如 ppcat store)
    this.logger.log(`Mirroring: ${sourceUrl}${raw ? ' [raw]' : ''}`);
    let content: string;
    let contentLength: number;
    try {
      if (raw) {
        const rawResult = await this.client.fetchRaw(sourceUrl, {
          timeoutMs: 30000,
          maxContentLength: 5 * 1024 * 1024, // 5MB max for binary
        });
        if (rawResult.statusCode !== 200) {
          this.logger.warn(`Non-200 status for ${sourceUrl}: ${rawResult.statusCode}`);
          return null;
        }
        content = rawResult.buffer.toString('binary');
        contentLength = rawResult.contentLength;
      } else {
        const result = await this.client.fetch(sourceUrl, {
          timeoutMs: 30000,
          maxContentLength: 2 * 1024 * 1024, // 2MB max per text file
        });
        if (result.statusCode !== 200) {
          this.logger.warn(`Non-200 status for ${sourceUrl}: ${result.statusCode}`);
          return null;
        }
        content = result.body;
        contentLength = result.contentLength;
      }
    } catch (e: any) {
      this.logger.warn(`Failed to fetch ${sourceUrl}: ${e.message}`);
      return null;
    }

    // 2. 计算 hash
    const rawHash = crypto.createHash('sha256').update(content, 'utf-8').digest('hex');

    // 3. 检查是否已存在 (hash 去重 + commit 去重)
    const existing = this.findByHash(provider, repositoryId, rawHash);
    if (existing) {
      this.logger.log(`Skipping ${fileName || sourceUrl}: hash ${rawHash.slice(0, 12)} already mirrored`);
      return existing;
    }

    // 4. 写入本地快照
    const mirrorDir = path.join(this.registryRoot, 'raw', provider, repositoryId, commitSha);
    fs.mkdirSync(mirrorDir, { recursive: true });

    const safeName = fileName || this.sanitizeFileName(sourceUrl);
    const hashPrefix = rawHash.slice(0, 12);
    const localFile = `${hashPrefix}-${safeName}`;
    const localPath = path.join(mirrorDir, localFile);

    fs.writeFileSync(localPath, content, raw ? 'binary' : 'utf-8');

    this.logger.log(`Mirrored: ${localFile} (${contentLength} bytes, hash: ${hashPrefix})`);

    return {
      localPath,
      rawHash,
      content,
      size: contentLength,
      sourceUrl,
    };
  }

  /**
   * 批量镜像仓库中的所有书源文件
   */
  async mirrorRepository(
    repositoryId: string,
    provider: string,
    repositoryUrl: string,
    branch: string,
    sourceFiles: { name: string; path: string; downloadUrl: string }[],
    raw: boolean = false,
  ): Promise<{ commitSha: string; snapshots: MirrorSnapshot[] }> {
    // 获取最新 commit
    const commitSha = await this.client.getCommitSha(repositoryUrl, branch) || 'unknown';

    // 检查是否已镜像过这个 commit
    if (this.isCommitMirrored(provider, repositoryId, commitSha)) {
      this.logger.log(`Commit ${commitSha.slice(0, 8)} already mirrored for ${repositoryId}, skipping`);
      return { commitSha, snapshots: [] };
    }

    // 批量下载
    const snapshots: MirrorSnapshot[] = [];
    for (const file of sourceFiles) {
      try {
        const snapshot = await this.mirrorFile(
          repositoryId, provider, commitSha,
          file.downloadUrl, file.name, raw,
        );
        if (snapshot) snapshots.push(snapshot);
      } catch (e: any) {
        this.logger.warn(`Failed to mirror ${file.name}: ${e.message}`);
      }
    }

    // 写入 manifest
    this.writeManifest(repositoryId, {
      repositoryId,
      repositoryUrl,
      branch,
      commitSha,
      importedAt: new Date().toISOString(),
      files: snapshots.map(s => ({
        sourceUrl: s.sourceUrl,
        localPath: s.localPath,
        rawHash: s.rawHash,
        size: s.size,
      })),
    });

    this.logger.log(
      `Repository ${repositoryId} mirrored: ${snapshots.length} files at commit ${commitSha.slice(0, 8)}`,
    );

    return { commitSha, snapshots };
  }

  /**
   * 获取已镜像的 manifest
   */
  getManifest(repositoryId: string): MirrorManifest | null {
    const manifestDir = path.join(this.registryRoot, 'manifests');
    const manifestPath = path.join(manifestDir, `${repositoryId}.json`);
    try {
      if (!fs.existsSync(manifestPath)) return null;
      return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    } catch {
      return null;
    }
  }

  /**
   * 列出所有已镜像的 manifest
   */
  listManifests(): MirrorManifest[] {
    const manifestDir = path.join(this.registryRoot, 'manifests');
    if (!fs.existsSync(manifestDir)) return [];
    return fs.readdirSync(manifestDir)
      .filter(f => f.endsWith('.json'))
      .map(f => {
        try {
          return JSON.parse(fs.readFileSync(path.join(manifestDir, f), 'utf-8'));
        } catch { return null; }
      })
      .filter(Boolean) as MirrorManifest[];
  }

  // ========== Private helpers ==========

  private findByHash(provider: string, repositoryId: string, hash: string): MirrorSnapshot | null {
    const baseDir = path.join(this.registryRoot, 'raw', provider, repositoryId);
    if (!fs.existsSync(baseDir)) return null;
    // Search under all commit directories
    const commitDirs = fs.readdirSync(baseDir, { withFileTypes: true }).filter(d => d.isDirectory());
    for (const dir of commitDirs) {
      const files = fs.readdirSync(path.join(baseDir, dir.name));
      for (const file of files) {
        if (file.startsWith(hash.slice(0, 12))) {
          const localPath = path.join(baseDir, dir.name, file);
          return {
            localPath,
            rawHash: hash,
            content: fs.readFileSync(localPath, 'utf-8'),
            size: fs.statSync(localPath).size,
            sourceUrl: '',
          };
        }
      }
    }
    return null;
  }

  private isCommitMirrored(provider: string, repositoryId: string, commitSha: string): boolean {
    const mirrorDir = path.join(this.registryRoot, 'raw', provider, repositoryId, commitSha);
    return fs.existsSync(mirrorDir) && fs.readdirSync(mirrorDir).length > 0;
  }

  private writeManifest(repositoryId: string, manifest: MirrorManifest): void {
    const manifestDir = path.join(this.registryRoot, 'manifests');
    fs.mkdirSync(manifestDir, { recursive: true });
    fs.writeFileSync(
      path.join(manifestDir, `${repositoryId}.json`),
      JSON.stringify(manifest, null, 2),
      'utf-8',
    );
  }

  private sanitizeFileName(url: string): string {
    try {
      const parsed = new URL(url);
      const parts = parsed.pathname.split('/');
      return parts[parts.length - 1] || 'unknown.json';
    } catch {
      return 'unknown.json';
    }
  }
}
