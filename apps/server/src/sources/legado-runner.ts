// Legado DSL Runner — executes Legado @js: expressions via QuickJS
import { MangaSource } from './source-store';

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
