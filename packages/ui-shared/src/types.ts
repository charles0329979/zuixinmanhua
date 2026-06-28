// Display-layer types — shared between web and mobile

export interface DisplayResult {
  id: string;
  comicId: string;
  title: string;
  cover: string;
  coverProxyUrl?: string;
  sourceId: string;
  sourceName: string;
  sourceType: 'hardcoded' | 'rule' | 'comicfs';
  author?: string;
  latestChapter?: string;
  status?: string;
  matchScore: number;
  matchLevel: 'high' | 'medium' | 'low';
  responseTimeMs: number;
}

export interface DisplayDetail {
  comicId: string;
  title: string;
  author: string;
  cover: string;
  coverProxyUrl?: string;
  status: string;
  description: string;
  source: string;
  tags?: string[];
}

export interface DisplayChapter {
  chapterId: string;
  title: string;
  url: string;
  index: number;
}

export interface SearchSummary {
  totalResults: number;
  sourcesSearched: number;
  sourcesFailed: number;
  ruleSources: number;
  hardcodedSources: number;
}
