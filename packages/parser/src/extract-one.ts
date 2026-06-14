// ============================================================
// packages/parser/src/extract-one.ts
// 从 HTML 中提取单个值
//
// 支持:
//   class.title@text → 提取 .title 元素的文本
//   a@href           → 提取 a 元素的 href 属性
//   &                → 当前元素自身文本
//   ||               → 回退选择器
//   &&               → 多选择器拼接
//   ##regex           → 正则过滤
// ============================================================

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { CheerioAPI, Cheerio } from 'cheerio';
import { splitChainSelector } from './chain-selector';
import { applyRegexFilter } from './regex-filter';

// ---- 内部属性提取 ----

function extractText($el: Cheerio<any>): string {
  if ($el.length === 0) return '';
  return $el.first().text().trim();
}

function extractAttr($el: Cheerio<any>, attr: string): string {
  if ($el.length === 0) return '';

  const el = $el.first();

  switch (attr) {
    case 'text':
      return el.text().trim();
    case 'html':
      return el.html()?.trim() || '';
    case 'ownText': {
      const clone = el.clone();
      clone.children().remove();
      return clone.text().trim();
    }
    default:
      return el.attr(attr) || '';
  }
}

// ---- 单个选择器部分提取 ----

/**
 * 提取单个选择器部分的值（不含 || / && / ## 处理）
 * 支持链式选择器: class.foo@tag.a@href
 */
function extractSinglePart(
  $: CheerioAPI,
  part: string,
  root: Cheerio<any>,
): string {
  if (!part || part === '&') {
    return root.text().trim();
  }

  const steps = splitChainSelector(part);

  // 从 root 开始，逐步缩小范围
  let $current: Cheerio<any> = root;
  for (const step of steps.selectors) {
    if (!step.css || step.css === '&') continue;
    try {
      $current = $current.find(step.css);
    } catch {
      return '';
    }
    if ($current.length === 0) return '';

    // 应用索引
    if (step.index !== undefined) {
      if (step.index < 0) {
        $current = $current.eq($current.length + step.index);
      } else {
        $current = $current.eq(step.index);
      }
      if ($current.length === 0) return '';
    }
  }

  // 提取最终值
  if (steps.attribute) {
    return extractAttr($current, steps.attribute);
  }

  return extractText($current);
}

// ---- 主入口 ----

/**
 * 从 HTML 中提取单个值
 *
 * @param $ cheerio 实例
 * @param rawSelector Legado 选择器，如 "class.title@text" 或 "a@href" 或 "&"
 * @param $scope 搜索范围（默认整个 document）
 * @returns 提取的字符串值
 */
export function extractOne(
  $: CheerioAPI,
  rawSelector: string,
  $scope?: Cheerio<any>,
): string {
  if (!rawSelector || rawSelector === '&') {
    if ($scope && rawSelector === '&') {
      return $scope.text().trim();
    }
    return '';
  }

  const root = $scope || $.root();

  // 1. 分离出 ## 正则过滤部分
  const hashParts = rawSelector.split('##');
  const selectorPart = hashParts[0];

  // 2. 处理 || 回退
  const fallbackParts = selectorPart.split('||');

  for (const fallback of fallbackParts) {
    // 3. 处理 && 连接
    const andParts = fallback.split('&&');

    if (andParts.length > 1) {
      const results: string[] = [];
      for (const part of andParts) {
        const val = extractSinglePart($, part.trim(), root);
        if (val) results.push(val);
      }
      if (results.length > 0) {
        const joined = results.join('');
        return applyRegexFilter(joined, rawSelector);
      }
      continue; // 尝试下一个 fallback
    }

    // 4. 单个选择器
    const val = extractSinglePart($, fallback.trim(), root);
    if (val) {
      return applyRegexFilter(val, rawSelector);
    }
  }

  return '';
}
