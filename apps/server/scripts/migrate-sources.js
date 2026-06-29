#!/usr/bin/env node
// ============================================================
// scripts/migrate-sources.js
// 将 data/sources.json 迁移到 data/source-platform/registry/
//
// 启用源 → registry/stable/
// 未启用源 → registry/candidates/
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const sourcesPath = path.join(__dirname, '..', 'data', 'sources.json');
const registryRoot = path.join(__dirname, '..', 'data', 'source-platform', 'registry');

if (!fs.existsSync(sourcesPath)) {
  console.log('sources.json not found — skipping migration');
  process.exit(0);
}

const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf-8'));
if (!Array.isArray(sources)) {
  console.log('sources.json is not an array — skipping');
  process.exit(0);
}

const dirs = ['stable', 'candidates'];
for (const d of dirs) fs.mkdirSync(path.join(registryRoot, d), { recursive: true });

let stableCount = 0;
let candidateCount = 0;

for (const s of sources) {
  const hash = crypto.createHash('sha256').update(JSON.stringify(s)).digest('hex');
  const entry = {
    id: s.id,
    name: s.name,
    version: '1.0.0-' + hash.slice(0, 8),
    hash,
    host: s.host || '',
    healthScore: s.enabled ? 90 : 0,
    publishedAt: s.updatedAt || s.createdAt || new Date().toISOString(),
    capabilities: {
      search: !!s.search?.listSelector,
      detail: !!s.detail?.titleSelector,
      chapters: !!s.chapters?.listSelector,
      images: !!s.images?.listSelector,
    },
    origin: { provider: 'legacy-migration', filePath: 'sources.json' },
  };

  const dir = s.enabled ? 'stable' : 'candidates';
  fs.writeFileSync(path.join(registryRoot, dir, entry.id + '.json'), JSON.stringify(entry, null, 2));
  if (s.enabled) stableCount++; else candidateCount++;
}

console.log('Migration complete: ' + stableCount + ' → stable, ' + candidateCount + ' → candidates');
