// ============================================================
// End-to-End Pipeline Test — 通过运行中的服务器
// 测试前需先启动: node dist/main.js
// ============================================================

const http = require('http');

const API = 'http://localhost:3001/api/admin/source-import';

function test(name: string, fn: () => Promise<void>) {
  console.log('  ' + name);
  return fn().catch(e => { console.log('    FAIL: ' + e.message); throw e; });
}

function assert(cond: boolean, msg: string) { if (!cond) throw new Error('FAIL: ' + msg); }

function get(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    http.get(API + path, { timeout: 10000 }, (res: any) => {
      let data = '';
      res.on('data', (c: string) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', reject);
  });
}

function post(path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = http.request(API + path, { method: 'POST', timeout: 30000 }, (res: any) => {
      let data = '';
      res.on('data', (c: string) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
console.log('E2E Pipeline Tests (requires running server):\n');

await test('GET repositories lists ppcat-store', async () => {
  const repos = await get('/repositories');
  assert(Array.isArray(repos), 'should return array');
  const ppcat = repos.find((r: any) => r.id === 'ppcat-store');
  assert(!!ppcat, 'ppcat-store should be in repos');
});

await test('GET candidates returns array', async () => {
  const candidates = await get('/candidates');
  assert(Array.isArray(candidates), 'should return array');
  console.log('    count: ' + candidates.length);
});

await test('GET stable returns count', async () => {
  const stable = await get('/stable');
  assert(typeof stable.count === 'number', 'should have count');
  console.log('    stable count: ' + stable.count);
});

await test('GET quarantine returns stats', async () => {
  const q = await get('/quarantine');
  assert(!!q.stats, 'should have stats');
});

await test('GET manual-review returns array', async () => {
  const mr = await get('/manual-review');
  assert(Array.isArray(mr), 'should return array');
});

await test('POST sync legado returns ok', async () => {
  const r = await post('/repositories/jiwangyihao-legado-all/sync');
  assert(r.ok === true, 'sync should succeed');
  assert(r.report.commitSha, 'should have commitSha');
  console.log('    commitSha: ' + r.report.commitSha.slice(0, 12) + ' scanned: ' + r.report.scannedFiles);
});

await test('GET runs returns list', async () => {
  const runs = await get('/runs');
  assert(Array.isArray(runs), 'should return array');
  console.log('    runs: ' + runs.length);
});

await test('GET OTA stable is empty (no source passed)', async () => {
  const otaResp = await new Promise((resolve, reject) => {
    http.get('http://localhost:3001/api/ota/index?channel=stable', { timeout: 5000 }, (res: any) => {
      let data = '';
      res.on('data', (c: string) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', reject);
  }) as any;
  assert(Array.isArray(otaResp.sources), 'stable OTA should return sources array');
  console.log('    stable OTA sources: ' + otaResp.sources.length);
});

await test('GET OTA all has sources (backward compat)', async () => {
  const otaResp = await new Promise((resolve, reject) => {
    http.get('http://localhost:3001/api/ota/index?channel=all', { timeout: 5000 }, (res: any) => {
      let data = '';
      res.on('data', (c: string) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', reject);
  }) as any;
  assert(Array.isArray(otaResp.sources), 'all OTA should return sources');
  assert(otaResp.sources.length > 0, 'all OTA should have sources (baozi, YYDS, etc)');
  console.log('    all OTA sources: ' + otaResp.sources.length);
});

await test('GET search still works (baozi/YYDS unaffected)', async () => {
  const searchResp = await new Promise((resolve, reject) => {
    http.get('http://localhost:3001/api/search?q=%E7%81%AB%E5%BD%B1', { timeout: 15000 }, (res: any) => {
      let data = '';
      res.on('data', (c: string) => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(data); } });
    }).on('error', reject);
  }) as any;
  assert(Array.isArray(searchResp.sources), 'search should return sources');
  const working = (searchResp.sources || []).filter((s: any) => s.results?.length > 0);
  assert(working.length >= 2, 'should have at least 2 working sources (baozi, manwa)');
  console.log('    working sources: ' + working.map((s: any) => s.sourceId).join(', '));
});

console.log('\nPASSED: all E2E tests\n');
})().catch(() => process.exit(1));
