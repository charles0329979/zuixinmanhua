// ============================================================
// pnpm verify:search-sources
// 批量诊断 comicfs 源 → 生成已验证搜索源配置
// ============================================================
import * as fs from 'fs';
import * as path from 'path';
import { getActiveSources, refreshRemoteSources } from '@/lib/comicfs/source-loader';
import { diagnoseSourceSearch } from '@/lib/search/diagnose-source-search';

const KEYWORDS = ['斗破苍穹', '斗罗大陆', '海贼王'];

interface VerifiedEntry {
  id: string;
  name: string;
  verifiedAt: string;
  keyword: string;
  parsedCount: number;
  finalSearchUrl: string;
}

async function main() {
  console.log('🔍 verify:search-sources — 开始批量诊断 comicfs 源...\n');

  // 1. Load sources
  let sources: Awaited<ReturnType<typeof getActiveSources>>['sources'] = [];
  try {
    sources = (await getActiveSources({ onlyOk: false })).sources;
  } catch { /* ok */ }
  if (sources.length === 0) {
    console.log('  ↻ 刷新远程源...');
    await refreshRemoteSources();
    sources = (await getActiveSources({ onlyOk: false })).sources;
  }

  const candidates = sources
    .filter((s) => s.riskLevel === 'low' || s.riskLevel === 'medium')
    .filter((s) => s.status === 'active');

  console.log(`  📊 candidates: ${candidates.length} (from ${sources.length} total)\n`);

  const verified: VerifiedEntry[] = [];
  const failedNames: string[] = [];

  // 2. Test each source, concurrency=2
  for (let i = 0; i < candidates.length; i += 2) {
    const batch = candidates.slice(i, i + 2);
    const results = await Promise.allSettled(
      batch.map(async (s) => {
        for (const kw of KEYWORDS) {
          const diag = await diagnoseSourceSearch(s.id, kw);
          if (diag.ok && diag.steps.parsedCount > 0) {
            return {
              id: s.id,
              name: s.name,
              keyword: kw,
              parsedCount: diag.steps.parsedCount,
              finalSearchUrl: diag.search.finalSearchUrl,
            };
          }
        }
        return null;
      }),
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === 'fulfilled' && r.value) {
        const v = r.value;
        console.log(`  ✅ ${v.name}: ${v.parsedCount} results for "${v.keyword}"`);
        verified.push({
          id: v.id,
          name: v.name,
          verifiedAt: new Date().toISOString(),
          keyword: v.keyword,
          parsedCount: v.parsedCount,
          finalSearchUrl: v.finalSearchUrl,
        });
      } else if (r.status === 'fulfilled') {
        const name = batch[j]?.name || 'unknown';
        console.log(`  ❌ ${name}: 0 results for all keywords`);
        failedNames.push(name);
      }
    }

    // Gentle delay between batches
    if (i + 2 < candidates.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // 3. Write output
  const outPath = path.resolve(
    __dirname,
    '../../config/verified-search-sources.generated.json',
  );
  const out = { enabled: true, sources: verified };
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf-8');

  console.log(`\n📄 Written to: ${outPath}`);
  console.log(`  ✅ Passed: ${verified.length}`);
  console.log(`  ❌ Failed: ${failedNames.length}`);

  if (verified.length > 0) {
    console.log('\n  Next steps:');
    console.log(
      '    cp apps/web/src/config/verified-search-sources.generated.json apps/web/src/config/verified-search-sources.json',
    );
    console.log('    重新搜索 → http://localhost:3000/search');
  } else {
    console.log('\n  ⚠️  No sources passed verification.');
    console.log('    Run diagnosis manually:');
    console.log(
      '    /api/debug/search-sources?keyword=斗破苍穹&limit=20',
    );
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
