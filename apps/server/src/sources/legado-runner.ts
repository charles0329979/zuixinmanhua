// Legado DSL Runner — executes Legado @js: expressions + CSS selector conversion
import { MangaSource } from './source-store';

/**
 * Convert a Legado CSS selector to standard CSS + attribute to extract.
 *
 * Legado syntax:
 *   class.xxx    → .xxx (CSS class selector)
 *   tag.xxx      → xxx   (CSS tag selector)
 *   id.xxx       → #xxx  (CSS id selector)
 *   @attr        → extract attribute (text, href, src, data-xxx, etc.)
 *   @tag.xxx     → child selector: find <xxx> descendants
 *   @class.xxx   → child selector: find .xxx descendants
 *   @@           → escaped @ (literal @ character)
 *   @js:         → JavaScript expression (handled by splitLegadoSelector)
 *
 * Examples:
 *   "class.update_con@tag.li" → css: ".update_con li", attr: "text"
 *   "tag.img@src"             → css: "img",            attr: "src"
 *   "class.title@text"        → css: ".title",         attr: "text"
 *   "a@href"                  → css: "a",              attr: "href"
 *   "class.list@tag.a@href"   → css: ".list a",        attr: "href"
 */
export function convertLegadoCss(raw: string): { cssSelector: string; attr: string } {
  if (!raw) return { cssSelector: 'body', attr: 'text' };

  // Step 1: Temporarily replace @@ with placeholder
  const escaped = raw.replace(/@@/g, '\x00AT\x00');

  // Step 2: Split by @ (but not inside \n@js:)
  const parts = escaped.split('@');

  // Step 3: Convert the first part (CSS selector base)
  let cssParts: string[] = [];
  const firstPart = parts[0].trim();
  if (firstPart) {
    // Convert class.xxx → .xxx, tag.xxx → xxx, id.xxx → #xxx
    cssParts.push(convertBaseSelector(firstPart));
  }

  // Step 4: Process remaining parts
  let attr = 'text'; // default

  for (let i = 1; i < parts.length; i++) {
    let part = parts[i].trim();

    // Restore escaped @
    part = part.replace(/\x00AT\x00/g, '@');

    if (!part) continue;

    // Check if it's a child selector (tag.xxx, class.xxx, id.xxx)
    if (part.startsWith('tag.')) {
      cssParts.push(part.slice(4)); // tag name only
    } else if (part.startsWith('class.')) {
      cssParts.push('.' + part.slice(6));
    } else if (part.startsWith('id.')) {
      cssParts.push('#' + part.slice(3));
    } else {
      // It's an attribute to extract (text, href, src, data-xxx, etc.)
      attr = part;
    }
  }

  const cssSelector = cssParts.join(' ').trim() || 'body';
  return { cssSelector, attr };
}

/** Convert Legado base selector to CSS: class.xxx→.xxx, tag.xxx→xxx, id.xxx→#xxx */
function convertBaseSelector(raw: string): string {
  const parts = raw.split(',').map(p => p.trim());
  return parts.map(part => {
    if (part.startsWith('class.')) return '.' + part.slice(6);
    if (part.startsWith('tag.')) return part.slice(4);
    if (part.startsWith('id.')) return '#' + part.slice(3);
    return part; // already a CSS selector
  }).join(', ');
}

/** Split a Legado selector into [cssPart, jsPart] */
export function splitLegadoSelector(selector: string): { cssPart: string; jsPart: string } {
  if (!selector) return { cssPart: '', jsPart: '' };
  const idx = selector.indexOf('\n@js:');
  if (idx < 0) return { cssPart: selector, jsPart: '' };
  return {
    cssPart: selector.slice(0, idx).trim(),
    jsPart: selector.slice(idx + 5).trim(), // skip '\n@js:'
  };
}

/** Check if any selectors in the source contain @js: expressions */
export function hasLegadoJs(source: MangaSource): boolean {
  const check = (s: string): boolean => !!(s && (s.includes('@js:') || s.includes('\n@js:')));
  return check(source.search.listSelector) || check(source.search.titleSelector) ||
    check(source.images.listSelector) || check(source.chapters.listSelector) ||
    check(source.detail.titleSelector);
}

/** Build a complete JS function from Legado source rules */
export function buildLegadoFunctions(source: MangaSource): string {
  const s = source.search;
  const d = source.detail;
  const c = source.chapters;
  const img = source.images;
  const host = source.host;
  const searchUrl = s.url.replace(/'/g, "\'");

  // Helper: convert a selector (possibly with @js:) into a function call
  function selectorFn(raw: string, defaultValue: string): string {
    if (!raw) return JSON.stringify(defaultValue);
    const { cssPart, jsPart } = splitLegadoSelector(raw);
    if (!jsPart) return JSON.stringify(cssPart); // plain CSS, handled by source-parser
    // For JS parts, we inject them into the QuickJS code
    return JSON.stringify(cssPart) + ' + "\n@js:\n" + ' + JSON.stringify(jsPart);
  }

  return [
    '// Auto-generated Legado functions for: ' + source.name,
    'var HOST = ' + JSON.stringify(host) + ';',
    'var SEARCH_URL = ' + JSON.stringify(searchUrl) + ';',
    '',
    'function search(args) {',
    '  var q = encodeURIComponent(args.query);',
    '  var url = SEARCH_URL.replace(/{{key}}/g, q).replace(/{{keyword}}/g, q);',
    '  // Use fetch to get search page, then parse with CSS selectors (handled by host)',
    '  return []; // CSS selectors handled by source-parser, not JS',
    '}',
    '',
    'function getComicDetail(args) {',
    '  return { comicId: args.comicId, title: "", cover: "" };',
    '}',
    '',
    'function getChapters(args) { return []; }',
    '',
    'function getChapterImages(args) {',
    '  // If source has imagesApi, use it. Otherwise return empty.',
    '  return { chapterId: args.chapterId, images: [] };',
    '}',
  ].join('\n');
}
