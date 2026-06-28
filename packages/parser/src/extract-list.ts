// ============================================================
// packages/parser/src/extract-list.ts
// 从 HTML 中提取列表 — 使用 @zuixinmanhua/dom
// ============================================================

import type { DomNode, DomDocument } from '@zuixinmanhua/dom';

/**
 * 从 HTML Document 中提取匹配选择器的元素列表
 *
 * @param doc DomDocument 实例
 * @param listSelector Legado 列表选择器（支持 || 回退）
 * @param scope 搜索范围（默认 root）
 * @returns 匹配的元素数组
 */
export function extractList(
  doc: DomDocument,
  listSelector: string,
  scope?: DomNode,
): DomNode[] {
  if (!listSelector) return [];

  const root = scope || doc.root;

  // 处理 || 回退
  const parts = listSelector.split('||');

  for (const part of parts) {
    try {
      const els = doc.querySelectorAll(part.trim(), root);
      if (els.length > 0) return els;
    } catch {
      continue;
    }
  }

  return [];
}
