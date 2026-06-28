// ============================================================
// packages/source-engine/src/types.ts
// Search engine types
// ============================================================

import type { MangaSource, ComicInfo, ChapterInfo, ChapterDetail } from '@zuixinmanhua/types';

export interface SearchRequest {
  query: string;
  /** Specific sources to search (empty = all enabled) */
  sourceIds?: string[];
  /** Max concurrent searches */
  maxConcurrency?: number;
  /** Per-source timeout ms */
  timeoutMs?: number;
  /** Min match score to include */
  minScore?: number;
  /** Max total results */
  maxResults?: number;
}

export interface SearchResult {
  comicId: string;
  title: string;
  cover: string;
  coverProxyUrl?: string;
  detailUrl: string;
  sourceId: string;
  sourceName: string;
  sourceType: 'hardcoded' | 'rule' | 'comicfs';
  author?: string;
  lastChapter?: string;
  status?: string;
  matchScore: number;
  matchLevel: 'high' | 'medium' | 'low';
}

export interface SearchBatch {
  /** Incremental batch number */
  batch: number;
  /** New results in this batch */
  results: SearchResult[];
  /** Cumulative result count */
  totalSoFar: number;
  /** The source this batch came from */
  sourceId: string;
  sourceName: string;
  /** Is this source done? */
  sourceDone: boolean;
  /** Is the entire search done? */
  searchDone: boolean;
  /** Elapsed ms since search started */
  elapsedMs: number;
}

export interface SearchOrchestratorOptions {
  /** Fast lane: sources to search first */
  fastLaneSize?: number;
  /** Batch lane: sources to search next */
  batchLaneSize?: number;
  /** Default timeout per source */
  defaultTimeout?: number;
  /** Default concurrency */
  defaultConcurrency?: number;
}

export interface SourceLane {
  /** Lane priority: 0=fastest, 1=batch, 2=tail */
  priority: number;
  sources: MangaSource[];
  concurrency: number;
  timeoutMs: number;
}

export type { MangaSource, ComicInfo, ChapterInfo, ChapterDetail };
