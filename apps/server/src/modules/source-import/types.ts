// ============================================================
// apps/server/src/modules/source-import/types.ts
// V4 导入管道类型 — 本模块独立副本
//
// 与 packages/types/src/source-*.ts 内容一致。
// 因 Node.js v24 ESM 无法正确解析跨 monorepo 的扩展名导入，
// 暂保留此独立副本。packages/types 为文档参考源。
// ============================================================

// ---- SourceImportProvider ----
export type SourceImportProvider = 'pipimiao' | 'github' | 'manual' | 'legado' | 'comicfs';

// ---- SourceOrigin ----
export interface SourceOrigin {
  provider: SourceImportProvider;
  repositoryUrl?: string;
  branch?: string;
  commitSha?: string;
  filePath?: string;
  importedAt: string;
  rawHash: string;
}

// ---- SourceCapabilities ----
export interface SourceCapabilities {
  search: boolean;
  detail: boolean;
  chapters: boolean;
  images: boolean;
  requiresJs: boolean;
  requiresLogin: boolean;
  requiresManualAdapter: boolean;
}

// ---- SourceLifecycleStatus ----
export type SourceLifecycleStatus =
  | 'DISCOVERED' | 'PARSED' | 'UNSUPPORTED' | 'STATIC_REJECTED'
  | 'CANDIDATE' | 'PENDING_VALIDATE' | 'VALIDATING' | 'QUARANTINED'
  | 'MANUAL_REVIEW' | 'VERIFIED' | 'PROMOTED' | 'DISABLED';

export const VALID_TRANSITIONS: Record<SourceLifecycleStatus, SourceLifecycleStatus[]> = {
  DISCOVERED:       ['PARSED', 'UNSUPPORTED'],
  PARSED:           ['CANDIDATE', 'PENDING_VALIDATE', 'MANUAL_REVIEW'],
  UNSUPPORTED:      ['DISABLED', 'MANUAL_REVIEW'],
  STATIC_REJECTED:  ['DISABLED', 'MANUAL_REVIEW'],
  CANDIDATE:        ['VALIDATING'],
  PENDING_VALIDATE: ['VALIDATING'],
  VALIDATING:       ['VERIFIED', 'QUARANTINED', 'MANUAL_REVIEW', 'STATIC_REJECTED'],
  QUARANTINED:      ['CANDIDATE', 'PENDING_VALIDATE', 'MANUAL_REVIEW', 'DISABLED'],
  MANUAL_REVIEW:    ['CANDIDATE', 'PENDING_VALIDATE', 'UNSUPPORTED', 'DISABLED', 'VERIFIED'],
  VERIFIED:         ['PROMOTED', 'QUARANTINED', 'DISABLED'],
  PROMOTED:         ['DISABLED', 'QUARANTINED'],
  DISABLED:         [],
};

export function isValidTransition(from: SourceLifecycleStatus, to: SourceLifecycleStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export const STATUS_LABELS: Record<SourceLifecycleStatus, string> = {
  DISCOVERED: '已发现', PARSED: '已解析', UNSUPPORTED: '不支持',
  STATIC_REJECTED: '静态拒绝', CANDIDATE: '候选', PENDING_VALIDATE: '待验证',
  VALIDATING: '验证中', QUARANTINED: '已隔离', MANUAL_REVIEW: '人工审核',
  VERIFIED: '已验证', PROMOTED: '已发布', DISABLED: '已禁用',
};

// ---- CanonicalRuleSection ----
export interface CanonicalRuleSection {
  url: string;
  method: 'GET' | 'POST';
  responseType: 'html' | 'json';
  listSelector: string;
  itemSelectors: Record<string, string>;
  bodyTemplate?: string;
}

// ---- CanonicalSourceDefinition ----
export interface CanonicalSourceDefinition {
  id: string;
  name: string;
  version?: string;
  type?: 'rule' | 'adapter';
  homepage?: string;
  host: string;
  baseUrl?: string;
  language?: string;
  search: CanonicalRuleSection;
  detail: CanonicalRuleSection;
  chapters: CanonicalRuleSection;
  images: CanonicalRuleSection;
  headers?: Record<string, string>;
  timeoutMs?: number;
  allowInsecureSSL?: boolean;
  origin?: SourceOrigin;
  raw?: unknown;
  rawRules?: unknown;
  fieldMappings: FieldMapping[];
  unmappedFields: UnmappedField[];
  warnings: string[];
  capabilities: SourceCapabilities;
}

export interface FieldMapping {
  rawPath: string;
  canonicalField: string;
  method: 'direct' | 'regex' | 'template' | 'llm-assisted';
  confidence: number;
}

export interface UnmappedField {
  rawPath: string;
  rawValue: unknown;
  reason: string;
}

export type ExternalFormatType =
  | 'legado-array' | 'legado-single' | 'comicfs' | 'pipimiao-legacy'
  | 'ppcat-binary' | 'json-array' | 'manga-source' | 'unknown';

export interface FormatDetectionResult {
  format: ExternalFormatType;
  confidence: number;
  reason: string;
  hasJsExpressions: boolean;
  requiresLogin: boolean;
  entryCount: number;
}

// ---- SourceValidationResult ----
export interface SourceValidationResult {
  sourceId?: string;
  staticPassed: boolean;
  networkPassed: boolean;
  searchPassed: boolean;
  detailPassed: boolean;
  chaptersPassed: boolean;
  imagesPassed: boolean;
  proxyPassed: boolean;
  testKeyword?: string;
  resultCount?: number;
  firstComicTitle?: string;
  firstChapterTitle?: string;
  firstImageUrl?: string;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  testedAt: string;
  layerDetails?: {
    static?: StaticLintDetail;
    network?: NetworkCheckDetail;
    search?: SearchCheckDetail;
    chain?: ChainCheckDetail;
  };
}

export interface StaticLintDetail {
  checks: { name: string; passed: boolean; message?: string }[];
  warnings: string[];
}

export interface NetworkCheckDetail {
  dnsResolved: boolean; dnsMs: number;
  tcpConnected: boolean; tcpMs: number;
  sslOk: boolean; sslMs: number;
  httpStatus: number | null;
  contentType: string | null;
  contentLength: number | null;
  redirectCount: number;
  blockedDetected: boolean;
  blockReason?: string;
  totalMs: number;
}

export interface SearchCheckDetail {
  keywords: string[];
  resultsPerKeyword: Record<string, number>;
  firstResultTitle?: string;
  firstResultUrl?: string;
  totalMs: number;
}

export interface ChainCheckDetail {
  detailUrl: string;
  detailTitleMatch: boolean;
  chapterCount: number;
  firstChapterTitle?: string;
  imageCount: number;
  firstImageUrl?: string;
  proxyImageStatus?: number;
  proxyImageContentType?: string;
  totalMs: number;
}

// ---- SourceHealthScore ----
export interface SourceHealthScore {
  sourceId?: string;
  total: number;
  staticScore: number;
  networkScore: number;
  searchScore: number;
  detailScore: number;
  chapterScore: number;
  imageScore: number;
  latencyScore: number;
  recommendation: 'PROMOTE' | 'KEEP_CANDIDATE' | 'QUARANTINE' | 'MANUAL_REVIEW';
}

// ---- ImportedSourceCandidate ----
export interface ImportedSourceCandidate {
  id: string;
  name: string;
  source?: CanonicalSourceDefinition;
  normalizedSource?: unknown;
  origin: SourceOrigin;
  capabilities: SourceCapabilities;
  lifecycleStatus: SourceLifecycleStatus;
  validation?: SourceValidationResult;
  health?: SourceHealthScore;
  conversionWarnings: string[];
  createdAt: string;
  updatedAt: string;
}

// ---- ImportRunReport (Fast Import Mode) ----
export interface ImportRunReport {
  runId: string;
  repositoryId: string;
  repositoryUrl: string;
  commitSha: string;
  startedAt: string;
  finishedAt: string;
  /** 扫描到的文件数 */
  scannedFiles: number;
  /** 检测到的源条目数 (一个文件可能含多条) */
  detectedSources: number;
  /** 成功解析为 CanonicalSourceDefinition 的数量 */
  parsedSources: number;
  /** 进入 candidates/ 候选池的数量 */
  candidateSources: number;
  /** 进入 MANUAL_REVIEW 的数量 */
  manualReviewSources: number;
  /** 解析失败的数量 */
  failedSources: number;
  /** 错误列表 */
  errors: ImportRunErrorSummary[];
}

export interface ImportRunErrorSummary {
  stage: string;
  count: number;
  sample: string;
}

// ---- RepositoryConfig ----
export interface RepositoryConfig {
  id: string;
  type: 'github';
  url: string;
  branch: string;
  enabled: boolean;
  format?: string;
  sourcePath?: string;
}
