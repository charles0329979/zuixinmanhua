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

  search: {
    url: string
    method?: 'GET' | 'POST'
    keywordParam?: string
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
