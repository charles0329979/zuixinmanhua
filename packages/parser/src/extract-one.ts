// ============================================================
// packages/parser/src/extract-one.ts
// 从 HTML 中提取单个值 — 使用 @zuixinmanhua/dom
//
// 支持: class.title@text | a@href | & | || | && | ##regex
// ============================================================

import type { DomNode, DomDocument } from '@zuixinmanhua/dom';
import { splitChainSelector } from './chain-selector';
import { applyRegexFilter } from './regex-filter';

// ---- 内部属性提取 ----

function extractText(node: DomNode): string {
  return node.textContent;
}

function extractAttr(node: DomNode, attr: string): string {
  switch (attr) {
    case 'text':
    case 'textContent':
      return node.textContent;
    case 'html':
    case 'innerHTML':
      return node.innerHTML;
    case 'ownText':
      return node.childText;
    default:
      return node.attrs[attr] || '';
  }
}

// ---- 单个选择器部分提取 ----

function extractSinglePart(
  doc: DomDocument,
  part: string,
  root: DomNode,
): string {
  if (!part || part === '&') {
    return root.textContent;
  }

  const steps = splitChainSelector(part);
  let current: DomNode | null = root;

  for (const step of steps.selectors) {
    if (!step.css || step.css === '&') continue;
    try {
      const matches = doc.querySelectorAll(step.css, current || undefined);
      if (matches.length === 0) return '';

      // 应用索引
      if (step.index !== undefined) {
        if (step.index < 0) {
          current = matches[matches.length + step.index] || null;
        } else {
          current = matches[step.index] || null;
        }
      } else {
        current = matches[0] || null;
      }
      if (!current) return '';
    } catch {
      return '';
    }
  }

  if (!current) return '';

  // 提取最终值
  if (steps.attribute) {
    return extractAttr(current, steps.attribute);
  }

  return extractText(current);
}

// ---- 主入口 ----

/**
 * 从 HTML Document 中提取单个值
 */
export function extractOne(
  doc: DomDocument,
  rawSelector: string,
  scope?: DomNode,
): string {
  if (!rawSelector || rawSelector === '&') {
    if (scope && rawSelector === '&') {
      return scope.textContent;
    }
    return '';
  }

  const root = scope || doc.root;

  // 1. 分离 ## 正则过滤
  const hashParts = rawSelector.split('##');
  const selectorPart = hashParts[0] || '';

  // 2. 处理 || 回退
  const fallbackParts = selectorPart.split('||');

  for (const fallback of fallbackParts) {
    // 3. 处理 && 连接
    const andParts = fallback.split('&&');

    if (andParts.length > 1) {
      const results: string[] = [];
      for (const part of andParts) {
        const val = extractSinglePart(doc, part.trim(), root);
        if (val) results.push(val);
      }
      if (results.length > 0) {
        return applyRegexFilter(results.join(''), rawSelector);
      }
      continue;
    }

    // 4. 单个选择器
    const val = extractSinglePart(doc, fallback.trim(), root);
    if (val) {
      return applyRegexFilter(val, rawSelector);
    }
  }

  return '';
}
