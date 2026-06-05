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
  headers?: Record<string, string>;
  timeoutMs?: number;
  createdAt: string; updatedAt: string;
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
};
