// ============================================================
// packages/types/src/comicfs.ts
// comicfs 远程书源注册中心类型
// ============================================================

// ---- 清单文件 ----
export interface ComicfsManifest {
  name: string;
  version: string;
  updatedAt: string;
  sourceCount: number;
  minClientVersion: string;
  indexUrl: string;
}

// ---- 索引中的源摘要 ----
export interface ComicfsSourceSummary {
  id: string;
  name: string;
  language: string;
  host: string;
  version: string;
  riskLevel: string;
  enabledByDefault: boolean;
  url: string;
  status: string;
  failureCount: number;
}

// ---- 索引文件 ----
export interface ComicfsIndex {
  version: string;
  updatedAt: string;
  count: number;
  sources: ComicfsSourceSummary[];
  manifestUrl: string;
  adConfigUrl: string;
  adConfig: ComicfsAdConfig;
}

// ---- 广告配置 ----
export interface ComicfsAdConfig {
  enabled: boolean;
  configUrl: string;
  updatedAt?: string;
}

// ---- 单个源完整规则 (Legado格式) ----
export interface ComicfsSourceRule {
  path: string;
  item: string;
  title: string;
  url: string;
  cover: string;
  latest: string;
  status: string;
  updateTime: string;
}

export interface ComicfsSourceSection {
  title: string;
  cover: string;
  author: string;
  description: string;
  status: string;
  latestChapter: string;
  list?: string;
  srcAttr?: string;
}

export interface ComicfsSource {
  id: string;
  name: string;
  host: string;
  language: string;
  weight: number;
  enabledByDefault: boolean;
  mode: string;
  version: string;
  riskLevel: string;
  search: ComicfsSourceRule;
  detail: ComicfsSourceSection;
  chapters: ComicfsSourceSection;
  images: ComicfsSourceSection;
  metadata?: {
    upstreamRepo?: string;
    upstreamId?: string;
    createdAt?: string;
    warnings?: string[];
  };
}

// ---- 源健康状态 ----
export interface ComicfsSourceHealthItem {
  id: string;
  name: string;
  host: string;
  status: string;
  riskLevel: string;
  ok: boolean;
  reason: string;
  checkedAt: string;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  totalFailures: number;
  previousStatus: string | null;
}

export interface ComicfsSourceHealth {
  generatedAt: string;
  total: number;
  checked: number;
  networkCheckEnabled: boolean;
  stateChanges: number;
  items: ComicfsSourceHealthItem[];
}

// ---- 错误类型 ----
export class ComicfsNetworkError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public originalUrl?: string,
  ) {
    super(message);
    this.name = 'ComicfsNetworkError';
  }
}

export class ComicfsParseError extends Error {
  constructor(
    message: string,
    public raw?: string,
  ) {
    super(message);
    this.name = 'ComicfsParseError';
  }
}
