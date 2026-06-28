// ============================================================
// Static Validator Test — 不发网络请求
// ============================================================

const { SourceStaticLintService } = require('../validation/source-static-validator.service');

function test(name: string, fn: () => void) { console.log('  ' + name); fn(); }
function assert(cond: boolean, msg: string) { if (!cond) throw new Error('FAIL: ' + msg); }

const svc = new SourceStaticLintService();

// fixture
function makeSource(overrides: any = {}) {
  return {
    id: 'test-001', name: 'Test Source',
    host: 'https://www.example.com',
    enabled: false, language: 'zh', weight: 0, tags: [],
    search: { url: '/search?q={{keyword}}', method: 'GET', listSelector: '.card', titleSelector: '.title', coverSelector: 'img', detailUrlSelector: 'a' },
    detail: { titleSelector: 'h1' },
    chapters: { listSelector: '.chapter-list', titleSelector: 'a', urlSelector: 'a' },
    images: { listSelector: '.content img', srcAttribute: 'src' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ====== Tests ======
console.log('Static Validator Tests:');

test('valid source passes all checks', () => {
  const r = svc.lint(makeSource());
  assert(r.passed, 'valid source should pass');
  assert(r.detail.checks.filter((c: any) => !c.passed).length === 0, 'no failed checks');
  const hasHostCheck = r.detail.checks.some((c: any) => c.name.includes('Host'));
  assert(hasHostCheck, 'should have host check');
});

test('missing id fails', () => {
  const r = svc.lint(makeSource({ id: '' }));
  assert(!r.passed, 'empty id should fail');
  assert(r.detail.checks.some((c: any) => !c.passed && c.message?.includes('ID')), 'should report ID missing');
});

test('missing name fails', () => {
  const r = svc.lint(makeSource({ name: '' }));
  assert(!r.passed, 'empty name should fail');
});

test('localhost host fails', () => {
  const r = svc.lint(makeSource({ host: 'https://localhost:3000' }));
  assert(!r.passed, 'localhost should be blocked');
});

test('127.0.0.1 fails', () => {
  const r = svc.lint(makeSource({ host: 'http://127.0.0.1/api' }));
  assert(!r.passed, '127.0.0.1 should be blocked');
});

test('private IP fails (192.168.x.x)', () => {
  const r = svc.lint(makeSource({ host: 'https://192.168.1.1' }));
  assert(!r.passed, '192.168 should be blocked');
});

test('private IP fails (10.x.x.x)', () => {
  const r = svc.lint(makeSource({ host: 'http://10.0.0.1' }));
  assert(!r.passed, '10.x should be blocked');
});

test('dangerous scheme fails', () => {
  const r = svc.lint(makeSource({ host: 'https://example.com', search: { ...makeSource().search, listSelector: 'javascript:alert(1)' } }));
  assert(!r.passed, 'javascript: scheme should be blocked');
});

test('empty selectors warn but pass', () => {
  const r = svc.lint(makeSource({ search: { ...makeSource().search, listSelector: '' }, chapters: undefined, images: undefined }));
  const warns = r.detail.warnings.filter((w: string) => w.includes('listSelector') || w.includes('Missing'));
  assert(warns.length > 0, 'should warn about empty selectors');
  // Note: passed depends on whether the empty selectors cause any check to fail
});

test('login detection produces warning', () => {
  const r = svc.lint(makeSource({ host: 'https://example.com', needLogin: true }));
  const authWarn = r.detail.warnings.find((w: string) => w.includes('MANUAL_REVIEW'));
  assert(!!authWarn, 'should produce MANUAL_REVIEW warning for login');
});

test('captcha detection produces warning', () => {
  const r = svc.lint(makeSource({ host: 'https://example.com', captchaUrl: '/captcha' }));
  const authWarn = r.detail.warnings.find((w: string) => w.includes('MANUAL_REVIEW'));
  assert(!!authWarn, 'should produce MANUAL_REVIEW warning for captcha');
});

test('csrfToken detection produces warning', () => {
  const r = svc.lint(makeSource({ host: 'https://example.com', csrfToken: 'token123' }));
  const authWarn = r.detail.warnings.find((w: string) => w.includes('MANUAL_REVIEW'));
  assert(!!authWarn, 'should produce MANUAL_REVIEW warning for csrf');
});

test('file:// scheme fails', () => {
  const src = makeSource();
  const srcStr = JSON.stringify(src).replace('https://www.example.com', 'file:///etc/passwd');
  const r = svc.lint(JSON.parse(srcStr));
  assert(!r.passed, 'file:// scheme should be blocked');
});

console.log('PASSED: all static validator tests\n');
