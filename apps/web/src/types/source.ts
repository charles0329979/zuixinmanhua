// ============================================================
// 书源规则格式 — 通用 CSS Selector 解析
// ============================================================

export interface MangaSource {
  id: string
  name: string
  host: string
  enabled: boolean
  language: string
  weight: number
  tags: string[]
  /** 'server' = 服务端抓取解析, 'client' = 客户端抓取HTML后提交服务端解析 (用于反爬严格的站点) */
  mode?: 'server' | 'client'

  search: {
    url: string
    method?: 'GET' | 'POST'
    keywordParam?: string
    /** 'html' = CSS选择器解析, 'json' = JSON路径解析 (如 KIMICMS API) */
    responseType?: 'html' | 'json'
    listSelector: string
    titleSelector: string
    coverSelector: string
    detailUrlSelector: string
    latestChapterSelector?: string
    statusSelector?: string
    updateTimeSelector?: string
  }

  detail: {
    titleSelector: string
    coverSelector?: string
    authorSelector?: string
    descriptionSelector?: string
    statusSelector?: string
    latestChapterSelector?: string
  }

  chapters: {
    listSelector: string
    titleSelector: string
    urlSelector: string
  }

  images: {
    listSelector: string
    srcAttribute: string
  }

  headers?: Record<string, string>
  timeoutMs?: number
  createdAt: string
  updatedAt: string
}

export interface AggregatedComicResult {
  title: string
  cover: string
  detailUrl: string
  sourceId: string
  sourceName: string
  latestChapter?: string
  status?: string
  updateTime?: string
}

export interface AggregatedSearchResponse {
  keyword: string
  totalResults: number
  sources: {
    sourceId: string
    sourceName: string
    results: AggregatedComicResult[]
    error?: string
  }[]
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
}
