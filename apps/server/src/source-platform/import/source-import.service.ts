// ============================================================
// source-platform/import/source-import.service.ts
// SourceImportService — 已知仓库导入管道 (V10)
//
// 流程:
//   repositories.json → github-repository-importer → raw snapshot
//   → format-detector → parser → canonical-normalizer
//   → registry/candidates (绝不写入 stable)
//
// 不支持: GitHub 自动搜索、全网搜索、自动收录未知仓库
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { SourceRegistryService } from '../registry/source-registry.service';
import { PipimiaoFormatDetectorService } from './source-format-detector.service';
import { PipimiaoNormalizerService } from './canonical-source-normalizer.service';
import { PpcatBinaryParserService } from './pipimiao-parser.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// ---- 仓库配置类型 ----

export interface RepositoryConfig {
  id: string;
  provider: 'pipimiao' | 'legado' | 'comicfs' | 'manual';
  type: 'github' | 'local';
  url: string;
  branch?: string;
  enabled: boolean;
}

@Injectable()
export class SourceImportService {
  private readonly logger = new Logger(SourceImportService.name);
  private readonly rawDir: string;

  constructor(
    private readonly registry: SourceRegistryService,
    private readonly formatDetector: PipimiaoFormatDetectorService,
    private readonly normalizer: PipimiaoNormalizerService,
    private readonly ppcatParser: PpcatBinaryParserService,
  ) {
    this.rawDir = path.join(process.cwd(), 'data', 'source-platform', 'raw');
  }

  // ============================================================
  // 仓库配置
  // ============================================================

  getRepositories(): RepositoryConfig[] {
    const fp = path.join(process.cwd(), 'data', 'source-platform', 'system', 'repositories.json');
    try {
      if (!fs.existsSync(fp)) return [];
      const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      return data.repositories || data;
    } catch { return []; }
  }

  // ============================================================
  // 同步已知仓库
  // ============================================================

  async syncRepository(repositoryId: string): Promise<{
    ok: boolean;
    report?: { scannedFiles: number; detectedSources: number; candidateSources: number; errors: string[] };
    error?: string;
  }> {
    const repos = this.getRepositories();
    const repo = repos.find(r => r.id === repositoryId);
    if (!repo) return { ok: false, error: `Repository not found: ${repositoryId}` };
    if (!repo.enabled) return { ok: false, error: `Repository is disabled: ${repositoryId}` };

    const report = { scannedFiles: 0, detectedSources: 0, candidateSources: 0, errors: [] as string[] };

    try {
      // 1. Fetch raw files from GitHub
      const files = await this.fetchRepoFiles(repo);
      report.scannedFiles = files.length;

      // 2. For each file: detect format → normalize → write to candidates
      for (const file of files) {
        try {
          const candidates = await this.processFile(file, repo);
          report.detectedSources += candidates.length;

          for (const c of candidates) {
            this.registry.saveCandidate(c.id as string, c);
            report.candidateSources++;
          }
        } catch (e: any) {
          report.errors.push(`${file.name}: ${e.message}`);
        }
      }

      this.logger.log(
        `Import ${repositoryId}: ${report.scannedFiles} files, ` +
        `${report.detectedSources} detected, ${report.candidateSources} candidates`,
      );

      return { ok: true, report };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  // ============================================================
  // 本地文件导入
  // ============================================================

  async importLocalFile(filePath: string): Promise<{
    ok: boolean;
    candidateCount?: number;
    error?: string;
  }> {
    try {
      if (!fs.existsSync(filePath)) return { ok: false, error: 'File not found' };
      const content = fs.readFileSync(filePath, 'utf-8');
      const name = path.basename(filePath);

      const repo: RepositoryConfig = { id: 'local', provider: 'manual', type: 'local', url: filePath, enabled: true };
      const candidates = await this.processFile({ name, content }, repo);

      for (const c of candidates) {
        this.registry.saveCandidate(c.id as string, c);
      }

      return { ok: true, candidateCount: candidates.length };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }

  // ============================================================
  // Private: fetch repo files
  // ============================================================

  private async fetchRepoFiles(repo: RepositoryConfig): Promise<{ name: string; content: string }[]> {
    if (repo.type === 'github') {
      return this.fetchGitHubRepo(repo);
    }
    if (repo.type === 'local') {
      return this.fetchLocalDir(repo.url);
    }
    return [];
  }

  private async fetchGitHubRepo(repo: RepositoryConfig): Promise<{ name: string; content: string }[]> {
    const match = repo.url.match(/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/);
    if (!match) return [];

    const [, owner, repoName] = match;
    const apiUrl = `https://api.github.com/repos/${owner}/${repoName}/contents?ref=${repo.branch || 'master'}`;

    try {
      const https = require('https');
      const result = await new Promise<string>((resolve, reject) => {
        https.get(apiUrl, {
          headers: { 'User-Agent': 'zuixinmanhua/1.0', 'Accept': 'application/vnd.github.v3+json' },
          timeout: 20000,
        }, (res: any) => {
          let data = '';
          res.on('data', (c: string) => data += c);
          res.on('end', () => resolve(data));
        }).on('error', reject);
      });

      const listing = JSON.parse(result);
      if (!Array.isArray(listing)) return [];

      const files = listing.filter((f: any) => f.type === 'file' && (f.name.endsWith('.json') || f.name === 'store' || f.name === 'meta'));
      const results: { name: string; content: string }[] = [];

      for (const f of files) {
        try {
          const content = await this.downloadFile(f.download_url);
          // Save raw snapshot
          const rawFile = path.join(this.rawDir, repo.provider, repo.id, f.name);
          fs.mkdirSync(path.dirname(rawFile), { recursive: true });
          fs.writeFileSync(rawFile, content);
          results.push({ name: f.name, content });
        } catch {}
      }
      return results;
    } catch {
      return [];
    }
  }

  private async downloadFile(url: string): Promise<string> {
    const https = require('https');
    return new Promise((resolve, reject) => {
      https.get(url, {
        headers: { 'User-Agent': 'zuixinmanhua/1.0' },
        timeout: 30000,
      }, (res: any) => {
        let data = '';
        res.on('data', (c: string) => data += c);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });
  }

  private fetchLocalDir(dirPath: string): { name: string; content: string }[] {
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath)
      .filter(f => f.endsWith('.json'))
      .map(f => ({ name: f, content: fs.readFileSync(path.join(dirPath, f), 'utf-8') }));
  }

  // ============================================================
  // Private: process single file through the pipeline
  // ============================================================

  private async processFile(
    file: { name: string; content: string },
    repo: RepositoryConfig,
  ): Promise<Record<string, unknown>[]> {
    const hash = crypto.createHash('sha256').update(file.content).digest('hex').slice(0, 12);

    // 1. Format detection
    const detection = this.formatDetector.detect(file.content, file.name);

    if (detection.format === 'unknown') {
      return [{
        id: `unknown-${repo.id}-${hash}`,
        name: `Unknown: ${file.name}`,
        lifecycleStatus: 'MANUAL_REVIEW',
        conversionWarnings: [`Unknown format: ${detection.reason}`],
        origin: { provider: repo.provider, repositoryUrl: repo.url },
        createdAt: new Date().toISOString(),
      }];
    }

    // 2. Parse
    let parsed: unknown;
    try {
      parsed = JSON.parse(file.content);
    } catch {
      return [{
        id: `parse-err-${repo.id}-${hash}`,
        name: `Parse Error: ${file.name}`,
        lifecycleStatus: 'MANUAL_REVIEW',
        conversionWarnings: ['JSON parse failed'],
        origin: { provider: repo.provider, repositoryUrl: repo.url },
        createdAt: new Date().toISOString(),
      }];
    }

    // 3. Normalize
    const canonicals = this.normalizer.normalize(parsed, detection.format, file.content);

    // 4. Write to candidates
    return canonicals.map(c => ({
      id: c.id || `${repo.id}-${hash}`,
      name: c.name || file.name,
      normalizedSource: c,
      lifecycleStatus: 'PENDING_VALIDATE',
      conversionWarnings: c.warnings || [],
      capabilities: c.capabilities || {},
      origin: { provider: repo.provider, repositoryUrl: repo.url, branch: repo.branch || '' },
      createdAt: new Date().toISOString(),
    }));
  }
}
