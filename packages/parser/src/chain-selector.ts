// ============================================================
// packages/parser/src/chain-selector.ts
// 链式选择器分词器 — "class.foo@tag.a@href" 解析为步骤序列
//
// Legado 链式选择器语法:
//   class.foo@tag.a@href  → 找到.foo → 在其下找a → 取href属性
//   @tag.a@href           → (以@开头)在当前元素下找a → 取href
//   class.title@text      → 找到.title → 取文本
// ============================================================

import { translateSelector } from './translate-selector';

// ---- 内部类型 ----

interface ChainStep {
  css: string;
  index?: number; // .N or .-N index
}

interface ChainSteps {
  selectors: ChainStep[]; // CSS selectors, applied left-to-right
  attribute: string | null; // final attribute to extract (null → text)
}

interface ChainToken {
  type: 'selector' | 'attribute';
  value: string;
}

// ---- Tokenizer ----

/**
 * 将链式选择器拆分为 Token 序列
 *
 * "class.foo@tag.a@href"
 *   → [{type:'selector', value:'class.foo'}, {type:'selector', value:'a'}, {type:'attribute', value:'href'}]
 *
 * "@tag.a@href" (以 @ 开头的相对选择器)
 *   → [{type:'selector', value:'a'}, {type:'attribute', value:'href'}]
 */
function tokenizeChain(raw: string): ChainToken[] {
  const tokens: ChainToken[] = [];
  let remaining = raw.trim();

  // 处理前导 @（相对选择器）
  if (remaining.startsWith('@')) {
    remaining = remaining.substring(1);
  }

  while (remaining.length > 0) {
    // 找到下一个 @（但跳过 @@）
    let atIdx = -1;
    for (let i = 0; i < remaining.length; i++) {
      if (remaining[i] === '@') {
        if (
          i + 1 < remaining.length &&
          remaining[i + 1] === '@'
        ) {
          i++; // skip @@
          continue;
        }
        atIdx = i;
        break;
      }
    }

    if (atIdx === -1) {
      // 没有更多 @ — 这是最后一个选择器
      tokens.push({ type: 'selector', value: remaining });
      break;
    }

    const beforeAt = remaining.substring(0, atIdx);
    const afterAt = remaining.substring(atIdx + 1);

    if (beforeAt) {
      tokens.push({ type: 'selector', value: beforeAt });
    }

    // 判断 @ 后面是子选择器 (tag./class./id.) 还是属性名
    if (/^(tag\.|class\.|id\.)/.test(afterAt)) {
      // 这是链式子选择器 @tag.a
      const chainMatch = afterAt.match(
        /^(tag\.|class\.|id\.)([^\s@|&]+)/,
      );
      if (chainMatch) {
        const chainValue = chainMatch[0];
        const translated = translateSelector(chainValue);
        tokens.push({
          type: 'selector',
          value:
            translated.css +
            (translated.index !== undefined
              ? '.' + translated.index
              : ''),
        });
        remaining = afterAt.substring(chainValue.length);
        continue;
      }
    }

    // 否则，@ 后面的是最终属性名
    tokens.push({ type: 'attribute', value: afterAt });
    break;
  }

  return tokens;
}

// ---- Public API ----

/**
 * 拆分链式选择器为 CSS 步骤列表 + 最终属性
 */
export function splitChainSelector(raw: string): {
  selectors: ChainStep[];
  attribute: string | null;
} {
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
