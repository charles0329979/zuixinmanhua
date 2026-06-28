import * as fs from 'fs';
import * as path from 'path';

export interface MangaSource {
  id: string; name: string; host: string; enabled: boolean;
  language: string; weight: number; tags: string[];
  /** 'server' = 服务端抓取解析, 'client' = 客户端抓取HTML后提交服务端解析 (用于反爬严格的站点) */
  mode?: 'server' | 'client';
  search: {
    url: string; method?: 'GET' | 'POST'; keywordParam?: string;
    /** 'html' = CSS选择器解析, 'json' = JSON路径解析 (如 KIMICMS API) */
    responseType?: 'html' | 'json';
    listSelector: string; titleSelector: string; coverSelector: string;
    detailUrlSelector: string; latestChapterSelector?: string;
    statusSelector?: string; updateTimeSelector?: string;
  };
  detail: {
    titleSelector: string; coverSelector?: string; authorSelector?: string;
    descriptionSelector?: string; statusSelector?: string; latestChapterSelector?: string;
  };
  chapters: { listSelector: string; titleSelector: string; urlSelector: string };
  images: { listSelector: string; srcAttribute: string };
  /** Optional: JavaScript-based source rules (executed via QuickJS sandbox) */
  jsRules?: {
    engine: 'quickjs';
    /** Inline JS source code */
    script?: string;
    /** Path to .js file relative to data/scripts/ directory */
    scriptFile?: string;
    /** Per-function timeout in ms (default: 5000) */
    timeoutMs?: number;
    /** VM memory limit in MB (default: 16, max: 64) */
    memoryLimitMb?: number;
  };
  /** Optional: API-based image fetching for sources that use JS lazy-loading (e.g. YYDS) */
  imagesApi?: {
    url: string; method?: 'GET' | 'POST'; listPath: string; urlField: string;
    bodyParams?: Record<string, string>;
    extractParams?: {
      selector: string; attribute: string; paramName: string; defaultValue?: string;
    }[];
    totalLimit?: number; batchSize?: number;
  };
  headers?: Record<string, string>;
  timeoutMs?: number;
  /** Allow insecure HTTPS connections (for sites with expired/bad SSL certs) */
  allowInsecureSSL?: boolean;
  createdAt: string; updatedAt: string;

  // === V4: 导入管道扩展字段 (全部可选，向后兼容) ===
  origin?: {
    provider: 'pipimiao' | 'github' | 'manual' | 'legado' | 'comicfs';
    repositoryUrl?: string; branch?: string;
    commitSha?: string; filePath?: string; importedAt: string; rawHash: string;
  };
  capabilities?: {
    search: boolean; detail: boolean; chapters: boolean; images: boolean;
    requiresJs: boolean; requiresLogin: boolean; requiresManualAdapter: boolean;
  };
  lifecycleStatus?: string;
  validation?: {
    staticPassed: boolean; networkPassed: boolean; searchPassed: boolean;
    detailPassed: boolean; chaptersPassed: boolean; imagesPassed: boolean;
    proxyPassed: boolean; latencyMs?: number; errorCode?: string;
    errorMessage?: string; testedAt: string; layerDetails?: any;
  };
  healthScore?: {
    total: number; staticScore: number; networkScore: number;
    searchScore: number; detailScore: number; chapterScore: number;
    imageScore: number; latencyScore: number;
    recommendation: string;
  };
  conversionWarnings?: string[];
}

const STORE_PATH = path.join(__dirname, '..', '..', 'data', 'sources.json');

function readStore(): MangaSource[] {
  try {
    if (!fs.existsSync(STORE_PATH)) return [];
    const raw = fs.readFileSync(STORE_PATH, 'utf-8');
    return JSON.parse(raw);
  } catch { return []; }
}

function writeStore(sources: MangaSource[]): void {
  fs.writeFileSync(STORE_PATH, JSON.stringify(sources, null, 2), 'utf-8');
}

export const sourceStore = {
  getSources: () => readStore(),
  getEnabledSources: () => readStore().filter(s => s.enabled),
  getSourceById: (id: string) => readStore().find(s => s.id === id) || null,

  createSource: (source: MangaSource): MangaSource => {
    const sources = readStore();
    const now = new Date().toISOString();
    source.createdAt = now; source.updatedAt = now;
    sources.push(source);
    writeStore(sources);
    return source;
  },

  updateSource: (id: string, updates: Partial<MangaSource>): MangaSource | null => {
    const sources = readStore();
    const idx = sources.findIndex(s => s.id === id);
    if (idx === -1) return null;
    sources[idx] = { ...sources[idx], ...updates, updatedAt: new Date().toISOString() };
    writeStore(sources);
    return sources[idx];
  },

  deleteSource: (id: string): boolean => {
    const sources = readStore();
    const filtered = sources.filter(s => s.id !== id);
    if (filtered.length === sources.length) return false;
    writeStore(filtered);
    return true;
  },

  toggleSource: (id: string): MangaSource | null => {
    const sources = readStore();
    const s = sources.find(s => s.id === id);
    if (!s) return null;
    s.enabled = !s.enabled;
    s.updatedAt = new Date().toISOString();
    writeStore(sources);
    return s;
  },

  importSources: (list: MangaSource[]): number => {
    const sources = readStore();
    const now = new Date().toISOString();
    let count = 0;
    for (const item of list) {
      const exists = sources.findIndex(s => s.id === item.id);
      item.createdAt = item.createdAt || now;
      item.updatedAt = now;
      if (exists >= 0) { sources[exists] = item; }
      else { sources.push(item); }
      count++;
    }
    writeStore(sources);
    return count;
  },

  exportSources: (): MangaSource[] => readStore(),

  // === V4: 导入管道扩展方法 ===

  /** 设置书源权重 */
  setWeight: (id: string, weight: number): MangaSource | null => {
    const sources = readStore();
    const s = sources.find(s => s.id === id);
    if (!s) return null;
    s.weight = weight;
    s.updatedAt = new Date().toISOString();
    writeStore(sources);
    return s;
  },

  /** 批量更新书源字段 */
  bulkUpdate: (updates: { id: string; changes: Partial<MangaSource> }[]): number => {
    const sources = readStore();
    const now = new Date().toISOString();
    let count = 0;
    for (const { id, changes } of updates) {
      const idx = sources.findIndex(s => s.id === id);
      if (idx === -1) continue;
      sources[idx] = { ...sources[idx], ...changes, updatedAt: now };
      count++;
    }
    if (count > 0) writeStore(sources);
    return count;
  },

  /** 按生命周期状态筛选书源 */
  getByStatus: (status: string): MangaSource[] => {
    return readStore().filter(s => (s as any).lifecycleStatus === status);
  },

  /** 带来源信息批量导入 */
  importWithOrigin: (list: MangaSource[], origin: {
    provider: string; repositoryUrl: string; branch?: string;
    commitSha?: string; filePath?: string; rawHash?: string;
  }): number => {
    const sources = readStore();
    const now = new Date().toISOString();
    let count = 0;
    for (const item of list) {
      const exists = sources.findIndex(s => s.id === item.id);
      item.createdAt = item.createdAt || now;
      item.updatedAt = now;
      // 附加来源追溯
      (item as any).origin = {
        provider: origin.provider,
        repositoryUrl: origin.repositoryUrl,
        branch: origin.branch,
        commitSha: origin.commitSha,
        filePath: origin.filePath || '',
        importedAt: now,
        rawHash: origin.rawHash || '',
      };
      if (exists >= 0) { sources[exists] = item; }
      else { sources.push(item); }
      count++;
    }
    writeStore(sources);
    return count;
  },
};
