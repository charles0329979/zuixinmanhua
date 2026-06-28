// ============================================================
// Format Detector Test
// ============================================================

const { PipimiaoFormatDetectorService } = require('../parsing/source-format-detector.service');

function test(name: string, fn: () => void) { console.log('  ' + name); fn(); }
function assert(cond: boolean, msg: string) { if (!cond) throw new Error('FAIL: ' + msg); }

const detector = new PipimiaoFormatDetectorService();

console.log('Format Detector Tests:');

test('detects legado-single', () => {
  const json = JSON.stringify({
    bookSourceName: 'Test Source', bookSourceUrl: 'https://example.com',
    ruleSearch: { bookList: '.list', name: '.title' },
    ruleBookInfo: {}, ruleToc: {}, ruleContent: {},
  });
  const r = detector.detect(json);
  assert(r.format === 'legado-single', 'should be legado-single, got ' + r.format);
  assert(r.confidence >= 0.9, 'confidence should be >= 0.9');
  assert(r.entryCount === 1, 'entryCount should be 1');
});

test('detects legado-array', () => {
  const entries = Array.from({ length: 3 }, (_, i) => ({
    bookSourceName: `Source ${i}`, bookSourceUrl: `https://example${i}.com`,
    ruleSearch: { bookList: '.list' },
  }));
  const r = detector.detect(JSON.stringify(entries));
  assert(r.format === 'legado-array', 'should be legado-array, got ' + r.format);
  assert(r.entryCount === 3, 'entryCount should be 3');
});

test('detects manga-source', () => {
  const json = JSON.stringify({
    id: 'src-1', name: 'Test', host: 'https://example.com',
    search: { url: '/s', listSelector: '.card', titleSelector: '.t', coverSelector: 'img', detailUrlSelector: 'a' },
    detail: { titleSelector: 'h1' },
    chapters: { listSelector: '.ch', titleSelector: 'a', urlSelector: 'a' },
    images: { listSelector: 'img', srcAttribute: 'src' },
  });
  const r = detector.detect(json);
  assert(r.format === 'manga-source', 'should be manga-source, got ' + r.format);
  assert(r.confidence >= 0.95, 'confidence should be >= 0.95');
});

test('detects comicfs', () => {
  const json = JSON.stringify({
    name: 'Test', host: 'https://example.com',
    search: { path: '/s', item: '.card', title: '.t' },
    detail: { title: 'h1' },
    chapters: { item: '.ch' },
    images: { item: 'img' },
  });
  const r = detector.detect(json);
  assert(r.format === 'comicfs', 'should be comicfs, got ' + r.format);
});

test('detects pipimiao-legacy', () => {
  const entries = Array.from({ length: 2 }, (_, i) => ({
    host: `https://example${i}.com`, name: `Source ${i}`,
    search: { url: '/search' },
    detail: { url: '/detail' },
  }));
  const r = detector.detect(JSON.stringify(entries));
  assert(r.format === 'pipimiao-legacy', 'should be pipimiao-legacy, got ' + r.format);
  assert(r.entryCount === 2, 'entryCount should be 2');
});

test('detects json-array (low confidence)', () => {
  const entries = [{ host: 'https://example.com', name: 'Unknown' }];
  const r = detector.detect(JSON.stringify(entries));
  assert(r.format === 'json-array', 'should be json-array, got ' + r.format);
  assert(r.confidence === 0.5, 'confidence should be 0.5 (MANUAL_REVIEW)');
});

test('detects ppcat-binary by filename', () => {
  const r = detector.detect('binary-data-here', 'store');
  assert(r.format === 'ppcat-binary', 'should be ppcat-binary, got ' + r.format);
});

test('returns unknown for unparseable content', () => {
  const r = detector.detect('not json at all');
  assert(r.format === 'unknown', 'should be unknown');
  assert(r.confidence === 0, 'confidence should be 0');
});

test('returns unknown for empty object', () => {
  const r = detector.detect('{}');
  assert(r.format === 'unknown', 'empty object should be unknown');
});

test('detects @js: expressions', () => {
  const json = JSON.stringify({
    bookSourceName: 'JS Source', bookSourceUrl: 'https://example.com',
    ruleSearch: { bookList: '@js:result = java.get("list")' },
  });
  const r = detector.detect(json);
  assert(r.hasJsExpressions, 'should detect @js: expressions');
});

console.log('PASSED: all format detector tests\n');
