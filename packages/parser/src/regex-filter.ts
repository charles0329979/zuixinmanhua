// ============================================================
// packages/parser/src/regex-filter.ts
// ## 正则过滤器 — Legado 的 ##pattern##replacement 语法
//
// 语法:
//   ##pattern             → 删除所有匹配
//   ##pattern##repl       → 正则替换
//   ##pattern##$1         → 提取捕获组
//   多个 ## 链式处理
// ============================================================

/**
 * 应用 ## 正则过滤到已提取的文本值
 * @param value 从 DOM 提取的原始文本
 * @param rawSelector 包含 ## 部分的原始选择器字符串
 */
export function applyRegexFilter(
  value: string,
  rawSelector: string,
): string {
  let result = value;

  // 按 ## 分割
  const parts = rawSelector.split('##');
  if (parts.length <= 1) return result;

  // 跳过第一部分（选择器本体），从第二部分开始处理过滤器
  for (let i = 1; i < parts.length; i++) {
    const clause = parts[i];
    if (!clause.trim()) continue;

    // ##$N → 捕获组提取
    const captureMatch = clause.match(/^\$(\d+)$/);
    if (captureMatch) {
      const groupIdx = parseInt(captureMatch[1], 10);
      // 用前一个 filter 部分的正则来匹配
      if (i > 1) {
        const prevPattern = parts[i - 1];
        try {
          const re = new RegExp(prevPattern, 'g');
          const match = re.exec(result);
          if (match && match[groupIdx]) {
            result = match[groupIdx];
          }
        } catch {
          // 正则错误，忽略
        }
      }
      continue;
    }

    // ##pattern##replacement
    const replMatch = clause.match(/^(.+?)##(.+)$/);
    if (replMatch) {
      try {
        const [, pattern, replacement] = replMatch;
        const re = new RegExp(pattern, 'g');
        result = result.replace(re, replacement);
      } catch {
        // 正则错误，保持原值
      }
      continue;
    }

    // ##pattern（仅删除匹配）
    try {
      const re = new RegExp(clause, 'g');
      result = result.replace(re, '');
    } catch {
      // 正则错误，保持原值
    }
  }

  return result.trim();
}
