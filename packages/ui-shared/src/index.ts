// ============================================================
// packages/ui-shared/src/index.ts
// 跨平台共享: 类型 + 纯函数 (UI helper)
// React hooks 留在各 apps 层
// ============================================================

export type {
  DisplayResult,
  DisplayDetail,
  DisplayChapter,
  SearchSummary,
} from './types';

export { normalizeImageUrl, getCoverProxyUrl } from './image-utils';
export { formatMatchScore, getMatchColor } from './display-utils';
