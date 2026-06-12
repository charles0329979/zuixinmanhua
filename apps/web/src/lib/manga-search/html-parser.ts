// ============================================================
// Legado/阅读3.0 选择器引擎
// 将 comicfs 源规则中的选择器语法翻译为 cheerio DOM 操作
//
// 支持的语法：
//   class. / tag. / id. → CSS 选择器翻译
//   selector@attr → 属性/文本提取 (@text, @href, @src, @html...)
//   ##regex##replacement → 正则过滤/替换
//   && → 多选择器结果拼接
//   || → 回退选择器
//   .0 / .-1 / .-2 → 元素索引
//   $. / $.. → JSONPath (基础支持)
//   {{@@...}} → 文本模板提取
// ============================================================
import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyNode = any;

// ==================== 选择器翻译 ====================

/**
 * 翻译 Legado 选择器缩写为 CSS 选择器
 * 同时剥离尾部的数字索引 .N / .-N
 *
 * 返回: { css: 纯CSS选择器, index?: 数字索引 (0-based from end if negative) }
 */
export function translateSelector(selector: string): { css: string; index?: number } {
  if (!selector) return { css: selector };

  let result = selector;
  let index: number | undefined;

  // 剥离尾部的 .N 或 .-N 索引
  const indexMatch = result.match(/\.(-?\d+)$/);
  if (indexMatch) {
    const idx = parseInt(indexMatch[1], 10);
    if (idx < 0) {
      // .-1 → cheerio 的负索引: -1 表示最后一个
      index = idx;
    } else {
      index = idx;
    }
    result = result.substring(0, result.length - indexMatch[0].length);
  }

  // class.word1-word2 — matches ENTIRE string until @, |, &
  // Spaces between words → dot-join for CSS
  // "class.foo bar baz" → ".foo.bar.baz"
  result = result.replace(/class\.([^@|&]+)/g, (_, name) => {
    return '.' + name.trim().replace(/\s+/g, '.');
  });

  // tag.xxx → 裸标签名
  result = result.replace(/tag\.([^\s@|&]+)/g, (_, name) => name);

  // id.xxx → #xxx
  result = result.replace(/id\.([^\s@|&]+)/g, (_, name) => '#' + name);

  return { css: result, index };
}

// ==================== 核心提取 ====================

/**
 * 从 HTML 元素提取文本
 */
function extractText($el: cheerio.Cheerio<AnyNode>): string {
  if ($el.length === 0) return '';
  return $el.first().text().trim();
}

/**
 * 从 HTML 元素提取属性
 */
function extractAttr($el: cheerio.Cheerio<AnyNode>, attr: string): string {
  if ($el.length === 0) return '';

  const el = $el.first();

  // @text → 文本内容
  if (attr === 'text') {
    return el.text().trim();
  }

  // @html → innerHTML
  if (attr === 'html') {
    return el.html()?.trim() || '';
  }

  // @ownText → 自身文本（不含子元素）
  if (attr === 'ownText') {
    // cheerio 没有直接的 ownText，用 clone + remove children
    const clone = el.clone();
    clone.children().remove();
    return clone.text().trim();
  }

  // 其他 → HTML 属性
  return el.attr(attr) || '';
}

// ==================== 正则过滤 ## ====================

/**
 * 应用 ## 正则过滤
 *
 * 语法：
 *   ##pattern           → 删除所有匹配
 *   ##pattern##repl     → 正则替换
 *   ##pattern##$1       → 提取捕获组
 *   多个 ## 用 ## 连接，依次处理
 */
function applyRegexFilter(value: string, rawSelector: string): string {
  // 从原始选择器中提取所有 ## 部分
  // ## 之前的选择器部分 + 之后的过滤部分
  let result = value;

  // 在属性提取后，我们需要处理 ## 过滤器
  // ## 过滤器附加在整个选择器字符串后面
  // 例如: "h2@text##\\s-.*" → 在 @text 之后应用 \\s-.* 过滤
  // 例如: "h2@text##.*(第\\d+話).*##$1" → 先匹配，再提取 $1

  // 找到所有 ## 子句（在 @ 属性说明符之后）
  const parts = rawSelector.split('##');
  if (parts.length <= 1) return result;

  // 跳过第一部分（它是选择器本身）
  for (let i = 1; i < parts.length; i++) {
    const clause = parts[i];

    // 空 clause → 跳过
    if (!clause.trim()) continue;

    // ##$N → 捕获组提取
    const captureMatch = clause.match(/^\$(\d+)$/);
    if (captureMatch) {
      const groupIdx = parseInt(captureMatch[1], 10);
      // 我们需要用第一个 filter 部分的正则来匹配
      if (i > 1) {
        const prevPattern = parts[i - 1];
        try {
          const re = new RegExp(prevPattern, 'g');
          const match = re.exec(result);
          if (match && match[groupIdx]) {
            result = match[groupIdx];
          }
        } catch {
          // regex error, ignore
        }
      }
      continue;
    }

    // ##pattern##replacement
    const replMatch = clause.match(/^(.+?)##(.+)$/);
    if (replMatch) {
      try {
        const [, pattern, replacement] = replMatch;
        // replacement 中的 $1 等需要保留为 regex 捕获组
        const re = new RegExp(pattern, 'g');
        result = result.replace(re, replacement);
      } catch {
        // regex error, keep original
      }
      continue;
    }

    // ##pattern（仅删除匹配）
    try {
      const re = new RegExp(clause, 'g');
      result = result.replace(re, '');
    } catch {
      // regex error, keep original
    }
  }

  return result.trim();
}

// ==================== 主入口 ====================

/**
 * 从 HTML 中提取单个值
 *
 * @param $ - cheerio 实例
 * @param rawSelector - Legado 选择器，如 "class.title@text" 或 "a@href"
 * @param $scope - 搜索范围（默认整个 document）
 * @returns 提取的字符串值
 */
export function extractOne(
  $: CheerioAPI,
  rawSelector: string,
  $scope?: cheerio.Cheerio<AnyNode>,
): string {
  if (!rawSelector || rawSelector === '&') {
    if ($scope && rawSelector === '&') {
      return $scope.text().trim();
    }
    return '';
  }

  const root = $scope || $.root();

  // 1. 先分离出 ## 正则过滤部分
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

/**
 * 提取单个选择器部分的值（不含 && / || / ## 处理）
 * 支持链式选择器: class.foo@tag.a@href
 */
function extractSinglePart(
  $: CheerioAPI,
  part: string,
  root: cheerio.Cheerio<AnyNode>,
): string {
  if (!part || part === '&') {
    return root.text().trim();
  }

  // 1. 将选择器拆分为链式步骤
  //    "class.foo@tag.a@href" → [".foo"], ["tag.a"], "href"
  //    "class.title@text" → [".title"], [], "text"
  const steps = splitChainSelector(part);

  // 2. 从 root 开始，逐步缩小范围
  let $current = root;
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

  // 3. 提取最终值
  if (steps.attribute) {
    return extractAttr($current, steps.attribute);
  }

  return extractText($current);
}

/**
 * 拆分链式选择器为 CSS 步骤列表 + 最终属性
 *
 * "class.comics-card@tag.a@href"
 *   → selectors: [".comics-card", "a"], attribute: "href"
 *
 * "class.title@text"
 *   → selectors: [".title"], attribute: "text"
 *
 * "tag.amp-img.0@src"
 *   → selectors: ["amp-img"], attribute: "src"   (index handled separately)
 *
 * "@tag.a@href" (以 @ 开头，相对于当前元素找子元素)
 *   → selectors: ["a"], attribute: "href"
 */
interface ChainStep {
  css: string;
  index?: number; // .N or .-N index
}

interface ChainSteps {
  selectors: ChainStep[];  // CSS selectors, applied left-to-right
  attribute: string | null;  // final attribute to extract (null → @text)
}

function splitChainSelector(raw: string): ChainSteps {
  const selectors: ChainStep[] = [];
  let attribute: string | null = null;

  const tokens = tokenizeChain(raw);

  for (const token of tokens) {
    if (token.type === 'selector') {
      const translated = translateSelector(token.value);
      selectors.push({ css: translated.css, index: translated.index });
    } else if (token.type === 'attribute') {
      attribute = token.value;
    }
  }

  return { selectors, attribute };
}

interface ChainToken {
  type: 'selector' | 'attribute';
  value: string;
}

/**
 * Tokenize a chain selector into parts
 * "@tag.a@href" → [{type:'selector', value:'a'}, {type:'attribute', value:'href'}]
 * "class.foo@tag.a@href" → [{type:'selector', value:'class.foo'}, {type:'selector', value:'a'}, {type:'attribute', value:'href'}]
 */
function tokenizeChain(raw: string): ChainToken[] {
  const tokens: ChainToken[] = [];
  let remaining = raw.trim();

  // Handle leading @ (relative to current element)
  if (remaining.startsWith('@')) {
    remaining = remaining.substring(1);
  }

  while (remaining.length > 0) {
    // Find next @ that is NOT part of @@
    let atIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] === '@') {
        if (i + 1 < remaining.length && remaining[i + 1] === '@') {
          i++; // skip @@
          continue;
        }
        atIdx = i;
        break;
      }
    }

    if (atIdx === -1) {
      // No more @ — this is a selector (may have suffixes like .0)
      tokens.push({ type: 'selector', value: remaining });
      break;
    }

    const beforeAt = remaining.substring(0, atIdx);
    const afterAt = remaining.substring(atIdx + 1);

    if (beforeAt) {
      tokens.push({ type: 'selector', value: beforeAt });
    }

    // Determine if afterAt starts a chain sub-selector or an attribute
    if (/^(tag\.|class\.|id\.)/.test(afterAt)) {
      // This is a chain sub-selector like @tag.a
      // Find where the chain selector name ends
      const chainMatch = afterAt.match(/^(tag\.|class\.|id\.)([^\s@|&]+)/);
      if (chainMatch) {
        const chainValue = chainMatch[0]; // e.g. "tag.a"
        const translated = translateSelector(chainValue); // {css: "a"}
        tokens.push({ type: 'selector', value: translated.css + (translated.index !== undefined ? `.${translated.index}` : '') });
        remaining = afterAt.substring(chainValue.length);
        continue;
      }
    }

    // Otherwise, treat everything after @ as the final attribute
    tokens.push({ type: 'attribute', value: afterAt });
    break;
  }

  return tokens;
}

/**
 * 从 HTML 中提取列表
 *
 * @param $ - cheerio 实例
 * @param listSelector - 列表项选择器（Legado 格式）
 * @param $scope - 搜索范围
 * @returns 匹配的元素集合
 */
export function extractList(
  $: CheerioAPI,
  listSelector: string,
  $scope?: cheerio.Cheerio<AnyNode>,
): cheerio.Cheerio<AnyNode> {
  if (!listSelector) return $([] as unknown as AnyNode[]);

  // 处理 || 回退
  const parts = listSelector.split('||');

  for (const part of parts) {
    const { css: cssSelector } = translateSelector(part.trim());
    const root = $scope || $.root();

    try {
      const $els = root.find(cssSelector);
      if ($els.length > 0) return $els;
    } catch {
      continue;
    }
  }

  return $([] as unknown as AnyNode[]);
}

/**
 * 从 JSON 数据中提取值（JSONPath 支持）
 * 简单的 $..path 语法支持
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
      // 数组索引
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
 * 从 JSON 数据中提取字符串列表
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
