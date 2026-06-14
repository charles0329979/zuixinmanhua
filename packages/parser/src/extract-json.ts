// ============================================================
// packages/parser/src/extract-json.ts
// JSONPath 提取器 — 基础 $. / $.. 路径支持
// ============================================================

/**
 * 从 JSON 数据中提取值
 *
 * @param data JSON 对象或数组
 * @param jsonPath JSONPath 路径，如 "$.data.list" 或 "$.results"
 * @returns 提取的值或 null
 */
export function extractFromJSON(
  data: unknown,
  jsonPath: string,
): unknown {
  if (!jsonPath || !data) return null;

  // $. → 从根开始
  let path = jsonPath.replace(/^\$\.?/, '');
  if (!path) return data;

  const parts = path.split('.');
  let current: unknown = data;

  for (const part of parts) {
    if (current === null || current === undefined) return null;

    if (Array.isArray(current)) {
      const idx = parseInt(part, 10);
      if (!isNaN(idx) && idx >= 0 && idx < current.length) {
        current = current[idx];
      } else {
        return null;
      }
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[part];
    } else {
      return null;
    }
  }

  return current;
}

/**
 * 从 JSON 数据中提取列表
 */
export function extractListFromJSON(
  data: unknown,
  jsonPath: string,
): unknown[] {
  const value = extractFromJSON(data, jsonPath);
  if (Array.isArray(value)) return value;
  if (value) return [value];
  return [];
}
