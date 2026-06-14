// ============================================================
// packages/parser/src/extract-list.ts
// 从 HTML 中提取列表
//
// 支持 || 回退选择器:
//   ".search-result@li||.list@div" → 先试 .search-result li, 不行再试 .list div
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CheerioAPI, Cheerio } from 'cheerio';
import { translateSelector } from './translate-selector';

/**
 * 从 HTML 中提取列表
 *
 * @param $ cheerio 实例
 * @param listSelector 列表项选择器（Legado 格式，支持 || 回退）
 * @param $scope 搜索范围
 * @returns 匹配的元素集合
 */
export function extractList(
  $: CheerioAPI,
  listSelector: string,
  $scope?: Cheerio<any>,
): Cheerio<any> {
  const empty = $([]);

  if (!listSelector) return empty;

  // 处理 || 回退
  const parts = listSelector.split('||');

  for (const part of parts) {
    const { css: cssSelector } = translateSelector(part.trim());
    const root = $scope || $.root();

    try {
      const els = root.find(cssSelector);
      if (els.length > 0) return els;
    } catch {
      continue;
    }
  }

  return empty;
}
