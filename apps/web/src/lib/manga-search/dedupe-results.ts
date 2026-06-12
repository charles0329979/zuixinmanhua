// ============================================================
// 搜索结果去重 — 跨源合并相同漫画
// ============================================================
import type { MangaSearchResult } from './types';

/**
 * 去重配置
 */
interface DedupeOptions {
  /** 标题相似度阈值 (0-1)，默认 0.8 */
  similarityThreshold?: number;
  /** 是否保留来自更多源的结果，默认 true */
  preferMultipleSources?: boolean;
}

/**
 * 对搜索结果去重
 * 策略：
 *   1. 按权重降序排列
 *   2. 对每个结果，检查是否与已有结果标题相似
 *   3. 相似的合并（保留权重更高的、来源更多的）
 */
export function dedupeResults(
  results: MangaSearchResult[],
  options: DedupeOptions = {},
): MangaSearchResult[] {
  const { similarityThreshold = 0.75, preferMultipleSources = true } = options;

  if (results.length <= 1) return results;

  // 按权重降序
  const sorted = [...results].sort((a, b) => (b.weight || 0) - (a.weight || 0));

  const clusters: MangaSearchResult[][] = [];

  for (const result of sorted) {
    let matched = false;

    for (const cluster of clusters) {
      const representative = cluster[0];

      // 检查是否与集群代表相似
      if (isSimilar(result.title, representative.title, similarityThreshold)) {
        cluster.push(result);
        matched = true;
        break;
      }
    }

    if (!matched) {
      clusters.push([result]);
    }
  }

  // 从每个集群中选择最佳代表
  return clusters.map((cluster) => selectRepresentative(cluster, preferMultipleSources));
}

/**
 * 计算两个标题的相似度
 * 使用简化的 Jaccard 系数 + 公共子串检测
 */
function isSimilar(title1: string, title2: string, threshold: number): boolean {
  const a = normalize(title1);
  const b = normalize(title2);

  if (a === b) return true;

  // 一个包含另一个
  if (a.includes(b) || b.includes(a)) return true;

  // 字符级 Jaccard
  const setA = new Set(a.split(''));
  const setB = new Set(b.split(''));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  const jaccard = intersection.size / union.size;
  if (jaccard >= threshold) return true;

  // 检查最长公共子串
  const lcs = longestCommonSubstring(a, b);
  const minLen = Math.min(a.length, b.length);
  if (lcs.length >= minLen * threshold) return true;

  return false;
}

/**
 * 标准化标题（去掉标点、空格、统一小写）
 */
function normalize(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\s，,。.！!？?：:；;、""''（）()《》【】\[\]{}…—\-–·・\s]+/g, '')
    .trim();
}

/**
 * 最长公共子串
 */
function longestCommonSubstring(a: string, b: string): string {
  const m = a.length;
  const n = b.length;
  let maxLen = 0;
  let endIndex = 0;

  // 使用滚动数组优化空间
  const dp = new Array(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    let prev = 0;
    for (let j = 1; j <= n; j++) {
      const temp = dp[j];
      if (a[i - 1] === b[j - 1]) {
        dp[j] = prev + 1;
        if (dp[j] > maxLen) {
          maxLen = dp[j];
          endIndex = i;
        }
      } else {
        dp[j] = 0;
      }
      prev = temp;
    }
  }

  return a.substring(endIndex - maxLen, endIndex);
}

/**
 * 从集群中选择最佳代表
 */
function selectRepresentative(
  cluster: MangaSearchResult[],
  preferMultipleSources: boolean,
): MangaSearchResult {
  if (cluster.length === 1) return cluster[0];

  // 找出权重最高的
  const maxWeight = Math.max(...cluster.map((r) => r.weight || 0));
  const topCandidates = cluster.filter((r) => (r.weight || 0) === maxWeight);

  if (topCandidates.length === 1) {
    const best = { ...topCandidates[0] };

    // 合并其他源的信息
    if (preferMultipleSources) {
      const otherSources = cluster
        .filter((r) => r.sourceId !== best.sourceId)
        .map((r) => r.sourceName);
      if (otherSources.length > 0) {
        best.sourceName = `${best.sourceName} +${otherSources.length}`;
      }
    }

    // 从其他结果中补充缺失的字段
    for (const other of cluster) {
      if (!best.cover && other.cover) best.cover = other.cover;
      if (!best.author && other.author) best.author = other.author;
      if (!best.latestChapter && other.latestChapter) best.latestChapter = other.latestChapter;
      if (!best.status && other.status) best.status = other.status;
      if (!best.updateTime && other.updateTime) best.updateTime = other.updateTime;
    }

    return best;
  }

  // 多个相同权重的，选封面最好的
  const withCover = topCandidates.filter((r) => r.cover);
  return withCover.length > 0 ? { ...withCover[0] } : { ...topCandidates[0] };
}
