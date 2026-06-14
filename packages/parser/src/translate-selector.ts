// ============================================================
// packages/parser/src/translate-selector.ts
// Legado 选择器缩写 → CSS 选择器翻译
//
// 支持的缩写:
//   class.word → .word
//   tag.div    → div
//   id.foo     → #foo
//   .N / .-N   → 元素索引 (尾部数字)
// ============================================================

/**
 * 翻译 Legado 选择器缩写为 CSS 选择器
 * 同时剥离尾部的数字索引 .N / .-N
 *
 * @returns { css: 纯CSS选择器, index?: 数字索引 }
 */
export function translateSelector(selector: string): {
  css: string;
  index?: number;
} {
  if (!selector) return { css: selector };

  let result = selector;
  let index: number | undefined;

  // 剥离尾部的 .N 或 .-N 索引
  const indexMatch = result.match(/\.(-?\d+)$/);
  if (indexMatch) {
    const idx = parseInt(indexMatch[1], 10);
    index = idx;
    result = result.substring(0, result.length - indexMatch[0].length);
  }

  // class.word1-word2 — 空格连接的多词 → .word1.word2
  result = result.replace(
    /class\.([^@|&]+)/g,
    (_, name: string) => '.' + name.trim().replace(/\s+/g, '.'),
  );

  // tag.xxx → 裸标签名
  result = result.replace(
    /tag\.([^\s@|&]+)/g,
    (_, name: string) => name,
  );

  // id.xxx → #xxx
  result = result.replace(
    /id\.([^\s@|&]+)/g,
    (_, name: string) => '#' + name,
  );

  return { css: result, index };
}
