// ============================================================
// apps/server/src/modules/source-import/parsing/source-importer.service.ts
// Fast Import Mode — 仓库拉取 → 格式识别 → 标准化 → 候选存储
//
// 设计原则:
//   - "已解析" ≠ "可用" — 所有结果进 candidates/，绝不直接进入 stable
//   - 无法解析的格式 → MANUAL_REVIEW (不丢弃)
//   - 解析异常 → MANUAL_REVIEW (保留原始数据)
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { RepositoryManifestService } from '../discovery/repository-manifest.service';
import { RepositoryClientService } from '../discovery/github-repository-client.service';
import { RepositoryMirrorService, MirrorSnapshot } from '../discovery/repository-mirror.service';
import { PipimiaoFormatDetectorService } from './source-format-detector.service';
import { PipimiaoNormalizerService } from './canonical-source-normalizer.service';
import { PpcatBinaryParserService } from './pipimiao-parser.service';
import type { MangaSource } from '../../../sources/source-store';
import type {
  CanonicalSourceDefinition,
  ImportedSourceCandidate,
  ImportRunReport,
  SourceOrigin,
  SourceCapabilities,
  SourceLifecycleStatus,
  FormatDetectionResult,
} from '../types';
import type { RepositoryConfig } from '../types';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

@Injectable()
export class PipimiaoImporterService {
  private readonly logger = new Logger(PipimiaoImporterService.name);
  private readonly registryRoot: string;
  private readonly candidatesDir: string;
  private readonly reportsDir: string;

  constructor(
    private readonly manifestService: RepositoryManifestService,
    private readonly client: RepositoryClientService,
    private readonly mirror: RepositoryMirrorService,
    private readonly formatDetector: PipimiaoFormatDetectorService,
    private readonly normalizer: PipimiaoNormalizerService,
    private readonly ppcatParser: PpcatBinaryParserService,
  ) {
    this.registryRoot = path.join(process.cwd(), 'data', 'source-registry');
    this.candidatesDir = path.join(this.registryRoot, 'candidates');
    this.reportsDir = path.join(this.registryRoot, 'reports', 'import-runs');
  }

  // ============================================================
  // Fast Import — 主入口
  // ============================================================

  /**
   * 快速导入指定仓库的所有书源
   *
   * 流程:
   *   1. 拉取仓库文件列表 (GitHub API)
   *   2. 镜像文件到本地 raw/ (commit去重 + hash去重)
   *   3. 扫描可能包含书源的文件
   *   4. 判断格式 (7种: legado/comicfs/pipimiao/manga-source/ppcat-binary/json/unknown)
   *   5. 解析 → CanonicalSourceDefinition
   *   6. 写入 data/source-registry/candidates/
   *   7. 生成 ImportRunReport
   */
  async syncRepository(repositoryId: string): Promise<ImportRunReport> {
    const startedAt = new Date();
    const runId = `run-${startedAt.toISOString().replace(/[:.]/g, '-')}`;

    const report: ImportRunReport = {
      runId,
      repositoryId,
      repositoryUrl: '',
      commitSha: '',
      startedAt: startedAt.toISOString(),
      finishedAt: '',
      scannedFiles: 0,
      detectedSources: 0,
      parsedSources: 0,
      candidateSources: 0,
      manualReviewSources: 0,
      failedSources: 0,
      errors: [],
    };

    try {
      // 1. 获取仓库配置
      const repo = this.manifestService.getRepository(repositoryId);
      if (!repo) {
        report.errors.push({ stage: 'config', count: 1, sample: `Repository ${repositoryId} not found` });
        report.finishedAt = new Date().toISOString();
        return report;
      }
      report.repositoryUrl = repo.url;

      // 2. 扫描文件列表
      const repoFormat = (repo as any).format as string | undefined;
      const isRaw = repoFormat === 'ppcat-binary';
      this.logger.log(`Fast Import: ${repo.url} (branch: ${repo.branch}, format: ${repoFormat || 'auto'})`);

      const extensions = isRaw ? ['.json', '.txt', 'store', 'meta', ''] : ['.json', '.txt'];
      const files = await this.client.listRepoFiles(repo.url, repo.branch, repo.sourcePath || '', extensions);
      report.scannedFiles = files.length;

      if (files.length === 0) {
        report.errors.push({ stage: 'fetch', count: 1, sample: `No source files found (${repoFormat || 'json/txt'})` });
        report.finishedAt = new Date().toISOString();
        this.saveReport(report);
        return report;
      }

      // 3. 镜像文件到本地
      const provider = isRaw ? 'pipimiao' : repo.type;
      const { commitSha, snapshots } = await this.mirror.mirrorRepository(
        repositoryId, provider, repo.url, repo.branch, files, isRaw,
      );
      report.commitSha = commitSha;

      // 4. 处理每个快照: 格式判断 → 解析 → CanonicalSourceDefinition
      for (const snapshot of snapshots) {
        try {
          const candidates = this.processSnapshot(snapshot, repo, commitSha);
          report.detectedSources += candidates.length;

          for (const candidate of candidates) {
            // 所有结果写入 candidates/ 目录
            this.saveCandidate(candidate);

            // 分类统计
            if (candidate.lifecycleStatus === 'CANDIDATE' || candidate.lifecycleStatus === 'PENDING_VALIDATE' || candidate.lifecycleStatus === 'PARSED') {
              report.parsedSources++;
              report.candidateSources++;
            } else if (candidate.lifecycleStatus === 'MANUAL_REVIEW') {
              report.manualReviewSources++;
            } else {
              report.failedSources++;
            }
          }
        } catch (e: any) {
          report.errors.push({
            stage: 'process',
            count: 1,
            sample: `Failed to process ${snapshot.sourceUrl}: ${e.message}`,
          });
        }
      }

    } catch (e: any) {
      report.errors.push({ stage: 'sync', count: 1, sample: e.message });
      this.logger.error(`Fast Import failed for ${repositoryId}: ${e.message}`);
    }

    report.finishedAt = new Date().toISOString();

    // 保存报告
    this.saveReport(report);

    this.logger.log(
      `Fast Import done: ${repositoryId} — ` +
      `${report.scannedFiles} files, ${report.detectedSources} detected, ` +
      `${report.candidateSources} candidates, ${report.manualReviewSources} manual, ` +
      `${report.failedSources} failed`,
    );

    return report;
  }

  // ============================================================
  // 快照处理: 格式判断 → 解析 → Candidate[]
  // ============================================================

  private processSnapshot(
    snapshot: MirrorSnapshot,
    repo: RepositoryConfig,
    commitSha: string,
  ): ImportedSourceCandidate[] {
    const now = new Date().toISOString();

    // ppcat-binary 格式走专用二进制解析器
    const repoFormat = (repo as any).format as string | undefined;
    if (repoFormat === 'ppcat-binary') {
      return this.processPpcatBinary(snapshot, repo, commitSha, now);
    }

    // 1. 判断格式
    const detection = this.formatDetector.detect(snapshot.content);

    // unknown → MANUAL_REVIEW (保留原始数据)
    if (detection.format === 'unknown') {
      return [this.createCandidate(
        `unknown-${snapshot.rawHash.slice(0, 12)}`,
        `Unknown Format (${snapshot.sourceUrl.split('/').pop()})`,
        null,
        repo, commitSha, snapshot,
        'MANUAL_REVIEW',
        { search: false, detail: false, chapters: false, images: false, requiresJs: false, requiresLogin: false, requiresManualAdapter: true },
        [`Format not recognized: ${detection.reason}. Raw file preserved at ${snapshot.localPath}`],
        now,
      )];
    }

    // 2. 标准化 → CanonicalSourceDefinition[]
    let canonicals: CanonicalSourceDefinition[];
    try {
      const parsed = JSON.parse(snapshot.content);
      canonicals = this.normalizer.normalize(parsed, detection.format, snapshot.content);
    } catch (e: any) {
      return [this.createCandidate(
        `parse-err-${snapshot.rawHash.slice(0, 12)}`,
        `Parse Error (${snapshot.sourceUrl.split('/').pop()})`,
        null,
        repo, commitSha, snapshot,
        'MANUAL_REVIEW',
        { search: false, detail: false, chapters: false, images: false, requiresJs: false, requiresLogin: false, requiresManualAdapter: true },
        [`Normalization failed: ${e.message}`],
        now,
      )];
    }

    if (canonicals.length === 0) {
      return [this.createCandidate(
        `empty-${snapshot.rawHash.slice(0, 12)}`,
        `Empty Source File (${snapshot.sourceUrl.split('/').pop()})`,
        null,
        repo, commitSha, snapshot,
        'MANUAL_REVIEW',
        { search: false, detail: false, chapters: false, images: false, requiresJs: false, requiresLogin: false, requiresManualAdapter: true },
        ['Normalization produced 0 sources'],
        now,
      )];
    }

    // 3. CanonicalSourceDefinition → MangaSource → Candidate
    const candidates: ImportedSourceCandidate[] = [];
    for (const canonical of canonicals) {
      const mangaSource = this.canonicalToMangaSource(canonical, now);
      const status = this.determineInitialStatus(canonical, detection);

      candidates.push(this.createCandidate(
        canonical.id,
        canonical.name,
        mangaSource,
        repo, commitSha, snapshot,
        status,
        canonical.capabilities,
        canonical.warnings,
        now,
      ));
    }

    return candidates;
  }

  // ============================================================
  // ppcat-binary 专用处理
  // ============================================================

  private processPpcatBinary(
    snapshot: MirrorSnapshot,
    repo: RepositoryConfig,
    commitSha: string,
    now: string,
  ): ImportedSourceCandidate[] {
    const storeBuffer = Buffer.from(snapshot.content, 'binary');
    if (!storeBuffer || storeBuffer.length === 0) {
      return [this.createCandidate(
        `ppcat-empty-${snapshot.rawHash.slice(0, 12)}`,
        'Empty ppcat store',
        null, repo, commitSha, snapshot,
        'MANUAL_REVIEW',
        { search: false, detail: false, chapters: false, images: false, requiresJs: false, requiresLogin: false, requiresManualAdapter: true },
        ['Store file is empty'],
        now,
      )];
    }

    const meta = { ruleId: '0', ruleVersion: 2009113, ruleContent: '', ruleAuto: true };
    const { sources, diagnostic } = this.ppcatParser.parse(storeBuffer, meta);

    if (sources.length === 0) {
      return [this.createCandidate(
        `ppcat-unknown-${snapshot.rawHash.slice(0, 12)}`,
        `ppcat_store v${diagnostic.version} (${diagnostic.fileSize}B)`,
        null, repo, commitSha, snapshot,
        'MANUAL_REVIEW',
        { search: false, detail: false, chapters: false, images: false, requiresJs: false, requiresLogin: false, requiresManualAdapter: true },
        [`Binary format: ${diagnostic.error || 'not recognized'}`, `Tried: ${diagnostic.decompressionAttempted.join(', ') || 'none'}`],
        now,
      )];
    }

    const candidates: ImportedSourceCandidate[] = [];
    const detection: FormatDetectionResult = {
      format: 'ppcat-binary' as any,
      confidence: 0.90,
      reason: `Ppcat binary v${diagnostic.version}, ${sources.length} entries`,
      hasJsExpressions: false,
      requiresLogin: false,
      entryCount: sources.length,
    };

    for (const canonical of sources) {
      const mangaSource = this.canonicalToMangaSource(canonical, now);
      const status = this.determineInitialStatus(canonical, detection);

      candidates.push(this.createCandidate(
        canonical.id,
        canonical.name,
        mangaSource,
        repo, commitSha, snapshot,
        status,
        canonical.capabilities || { search: true, detail: true, chapters: true, images: true, requiresJs: false, requiresLogin: false, requiresManualAdapter: false },
        canonical.warnings || [],
        now,
      ));
    }

    this.logger.log(`PpcatBinary: created ${candidates.length} candidates from store`);
    return candidates;
  }

  // ============================================================
  // Candidate 工厂
  // ============================================================

  private createCandidate(
    id: string,
    name: string,
    normalizedSource: MangaSource | null,
    repo: RepositoryConfig,
    commitSha: string,
    snapshot: MirrorSnapshot,
    status: SourceLifecycleStatus,
    capabilities: SourceCapabilities,
    warnings: string[],
    now: string,
  ): ImportedSourceCandidate {
    const origin: SourceOrigin = {
      provider: (repo as any).format === 'ppcat-binary' ? 'pipimiao' : repo.type as SourceOrigin['provider'],
      repositoryUrl: repo.url,
      branch: repo.branch,
      commitSha,
      filePath: snapshot.sourceUrl,
      importedAt: now,
      rawHash: snapshot.rawHash,
    };

    const source: MangaSource = normalizedSource || {
      id, name, host: '', enabled: false, language: 'zh', weight: 0,
      tags: ['imported', 'unparseable'],
      search: { url: '', method: 'GET', responseType: 'html', listSelector: '', titleSelector: '', coverSelector: '', detailUrlSelector: '' },
      detail: { titleSelector: '' },
      chapters: { listSelector: '', titleSelector: '', urlSelector: '' },
      images: { listSelector: '', srcAttribute: 'src' },
      createdAt: now, updatedAt: now,
      origin, capabilities, lifecycleStatus: status, conversionWarnings: warnings,
    };

    return {
      id, name,
      normalizedSource: source,
      origin, capabilities,
      lifecycleStatus: status,
      conversionWarnings: warnings,
      createdAt: now, updatedAt: now,
    };
  }

  private canonicalToMangaSource(canonical: CanonicalSourceDefinition, now: string): MangaSource {
    return {
      id: canonical.id,
      name: canonical.name,
      host: canonical.host,
      enabled: false,
      language: canonical.language || 'zh',
      weight: 0,
      tags: ['imported'],
      search: {
        url: canonical.search.url,
        method: canonical.search.method,
        responseType: canonical.search.responseType,
        listSelector: canonical.search.listSelector,
        titleSelector: canonical.search.itemSelectors.title || '',
        coverSelector: canonical.search.itemSelectors.cover || '',
        detailUrlSelector: canonical.search.itemSelectors.url || '',
      },
      detail: {
        titleSelector: canonical.detail.itemSelectors.title || '',
        coverSelector: canonical.detail.itemSelectors.cover,
        authorSelector: canonical.detail.itemSelectors.author,
        descriptionSelector: canonical.detail.itemSelectors.description,
      },
      chapters: {
        listSelector: canonical.chapters.listSelector,
        titleSelector: canonical.chapters.itemSelectors.title || '',
        urlSelector: canonical.chapters.itemSelectors.url || '',
      },
      images: {
        listSelector: canonical.images.listSelector,
        srcAttribute: canonical.images.itemSelectors.src || 'src',
      },
      headers: canonical.headers,
      timeoutMs: canonical.timeoutMs,
      allowInsecureSSL: canonical.allowInsecureSSL,
      capabilities: canonical.capabilities,
      lifecycleStatus: 'PARSED',
      conversionWarnings: canonical.warnings,
      createdAt: now,
      updatedAt: now,
    } as MangaSource;
  }

  private determineInitialStatus(
    canonical: CanonicalSourceDefinition,
    detection: FormatDetectionResult,
  ): SourceLifecycleStatus {
    if (canonical.capabilities.requiresJs || detection.hasJsExpressions) return 'MANUAL_REVIEW';
    if (canonical.capabilities.requiresLogin || detection.requiresLogin) return 'MANUAL_REVIEW';
    if (canonical.capabilities.requiresManualAdapter) return 'MANUAL_REVIEW';
    if (!canonical.search.url && !canonical.search.listSelector) return 'MANUAL_REVIEW';
    if (detection.confidence < 0.5) return 'MANUAL_REVIEW';
    return 'CANDIDATE';
  }

  // ============================================================
  // 持久化
  // ============================================================

  private saveCandidate(candidate: ImportedSourceCandidate): void {
    // MANUAL_REVIEW 写入 manual-review/ 目录，其余写入 candidates/
    const isManual = candidate.lifecycleStatus === 'MANUAL_REVIEW';
    const dir = isManual
      ? path.join(this.registryRoot, 'manual-review')
      : this.candidatesDir;
    const filePath = path.join(dir, `${candidate.id}.json`);
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(candidate, null, 2), 'utf-8');
    } catch (e: any) {
      this.logger.warn(`Failed to save candidate ${candidate.id}: ${e.message}`);
    }
  }

  private saveReport(report: ImportRunReport): void {
    const filePath = path.join(this.reportsDir, `${report.runId}.json`);
    try {
      fs.mkdirSync(this.reportsDir, { recursive: true });
      fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf-8');
    } catch (e: any) {
      this.logger.warn(`Failed to save report: ${e.message}`);
    }
  }
}
