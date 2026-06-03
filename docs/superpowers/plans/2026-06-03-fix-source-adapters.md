# Fix Source Adapters — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复全部 5 个书源适配器，使每个源都通过搜索/详情/章节图片端到端验证。

**Architecture:** 分 3 阶段 — Phase 1 用 curl 并行诊断所有源的真实网站状态；Phase 2 根据诊断结果分类修复（域名/超时配置 vs 选择器/API 重写）；Phase 3 启动后端逐源验证。

**Tech Stack:** curl + cheerio 分析 → TypeScript (NestJS 适配器) → sql.js (DB 配置更新)

---

## 当前状态速览

| 源 | 域名 (active) | Tier | 问题 |
|---|---|---|---|
| copy | mangacopy.com, copymanga.tv | core | 搜索返回 0 结果 — API 端点可能已变更 |
| dongmanzhijia | dmzj.com | core | 搜索返回 0 结果 — cheerio 选择器可能不匹配 |
| manwa | manwa.com (5 fails, ~1888ms) | supplement | 超时但可达 — 域名慢/端点不对 |
| yeman | yemancomic.com (3 fails, ~1337ms) | supplement | 超时但可达 — 域名慢/端点不对 |
| baozi | baozimh.com (healthy, ~687ms) | core | 需加 bzmgcn.com 域名 |

---

### Task 1: 诊断 拷贝漫画 (copy) 网站真实 API

**Files:** (只读 curl，不修改文件)

- [ ] **Step 1: curl 搜索 API**

拷贝漫画适配器走 API JSON 模式（非 cheerio）。先探测主页和搜索接口：

```bash
# 测试主域名可达性
curl -sL -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" \
  "https://www.mangacopy.com" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0"

# 尝试常见的搜索 API 路径
curl -sL "https://www.mangacopy.com/api/search?q=斗罗&limit=5" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0" | head -c 2000

# 备用域名
curl -sL "https://copymanga.tv/api/search?q=斗罗&limit=5" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0" | head -c 2000
```

- [ ] **Step 2: 分析返回结构**

观察返回的 JSON 结构，找到：
- `results` / `data.list` / `items` 中的实际字段名
- comicId, title, author, cover, lastChapter 对应字段
- 是否有分页

- [ ] **Step 3: 探测详情/章节 API**

```bash
# 用搜索返回的第一个 comicId 测详情 API
curl -sL "https://www.mangacopy.com/api/comic/<从Step2获取的真实comicId>" \
  -H "User-Agent: Mozilla/5.0 Chrome/131.0.0.0" | head -c 2000

# 测章节列表
curl -sL "https://www.mangacopy.com/api/comic/<comicId>/chapters" \
  -H "User-Agent: Mozilla/5.0 Chrome/131.0.0.0" | head -c 2000
```

- [ ] **Step 4: 记录诊断结论**

在 Task 6 实施修复前，记录：
- 真实的 API base URL（可能需要修改域名，如 `api.mangacopy.com`）
- 搜索/详情/章节的响应 JSON 字段映射
- 和当前适配器代码的差异

---

### Task 2: 诊断 动漫之家 (dongmanzhijia) 网站结构

**Files:** (只读 curl，不修改文件)

- [ ] **Step 1: 抓取搜索页 HTML**

```bash
# 动漫之家搜索页
curl -sL "https://www.dmzj.com/search?keyword=斗罗" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0" \
  | head -c 5000
```

- [ ] **Step 2: 分析 DOM 结构**

在上面返回的 HTML 中，找到搜索结果对应的 CSS class：
- 每个漫画卡片用什么 class？（当前适配器用 `.cartoon-item, .search-result-item, .comic-item`）
- 标题/作者/封面 img 的实际 class 名
- 链接格式（`/info/xxx.html` 还是其他？）

- [ ] **Step 3: 检查是否走 API**

```bash
# 检查是否有 XHR/JSON API
curl -sL "https://www.dmzj.com/api/search?keyword=斗罗" \
  -H "User-Agent: Mozilla/5.0 Chrome/131.0.0.0" | head -c 2000
```

- [ ] **Step 4: 抓取详情页**

```bash
# 用已知漫画 ID 测详情页
curl -sL "https://www.dmzj.com/info/yaojingweibao.html" \
  -H "User-Agent: Mozilla/5.0 Chrome/131.0.0.0" | head -c 5000
```

- [ ] **Step 5: 记录诊断结论**

记录真实的 CSS 选择器映射和 URL 模式，供 Task 7 使用。

---

### Task 3: 诊断 漫蛙 (manwa) 可用性

**Files:** (只读 curl，不修改文件)

- [ ] **Step 1: 测试主域名可达性**

```bash
# 计时检测
curl -sL -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" \
  "https://manwa.com" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0" \
  --connect-timeout 5 --max-time 10
```

- [ ] **Step 2: 测试搜索功能**

```bash
curl -sL "https://manwa.com/search?q=斗罗" \
  -H "User-Agent: Mozilla/5.0 Chrome/131.0.0.0" \
  --connect-timeout 5 --max-time 15 | head -c 3000
```

- [ ] **Step 3: 判断处理策略**

根据诊断结果：
- HTTP 200 + 有搜索结果 → 只需调大超时，跳到 Task 4
- HTTP 200 + 无结果 → 检查 HTML 选择器是否变化
- 超时/不可达 → 尝试搜索替代域名（manwa.me, manwa.cc 等），如果全部不可达 → disable

- [ ] **Step 4: 记录诊断结论**

记录域名状态和所需修复类型。

---

### Task 4: 诊断 野蛮漫画 (yeman) 可用性

**Files:** (只读 curl，不修改文件)

- [ ] **Step 1: 测试主域名可达性**

```bash
curl -sL -o /dev/null -w "HTTP %{http_code} in %{time_total}s\n" \
  "https://www.yemancomic.com" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0" \
  --connect-timeout 5 --max-time 10
```

- [ ] **Step 2: 测试搜索功能**

```bash
curl -sL "https://www.yemancomic.com/search?keyword=斗罗" \
  -H "User-Agent: Mozilla/5.0 Chrome/131.0.0.0" \
  --connect-timeout 5 --max-time 15 | head -c 3000
```

- [ ] **Step 3: 判断处理策略**

同 Task 3 — 可达 → 调超时；不可达 → 找替代域名或 disable。

- [ ] **Step 4: 记录诊断结论**

---

### Task 5: 包子漫画 (baozi) — 添加备用域名

**Files:**
- Modify: `apps/server/data/comic-sources.db` (source_domains 表)

- [ ] **Step 1: 插入 bzmgcn.com 域名**

```bash
cd "$HOME/zuixinmanhua/apps/server" && node -e "
const initSqlJs = require('sql.js');
const fs = require('fs');
(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('data/comic-sources.db');
  const db = new SQL.Database(buf);

  // Check if bzmgcn.com already exists
  const existing = db.exec(\"SELECT id FROM source_domains WHERE source_id='baozi' AND url LIKE '%bzmgcn%'\");
  if (existing.length === 0 || existing[0].values.length === 0) {
    db.run(\"INSERT INTO source_domains (source_id, url, priority, is_active, note) VALUES ('baozi', 'https://www.bzmgcn.com', 1, 1, '备用域名')\");
    const data = db.export();
    fs.writeFileSync('data/comic-sources.db', Buffer.from(data));
    console.log('✅ 已添加 bzmgcn.com 域名');
  } else {
    console.log('⏭️ 域名已存在，跳过');
  }
})();
"
```

- [ ] **Step 2: 验证插入结果**

```bash
cd "$HOME/zuixinmanhua/apps/server" && node -e "
const initSqlJs = require('sql.js');
const fs = require('fs');
(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('data/comic-sources.db');
  const db = new SQL.Database(buf);
  const domains = db.exec(\"SELECT * FROM source_domains WHERE source_id='baozi' ORDER BY priority\");
  if (domains[0]) domains[0].values.forEach(r => console.log(r));
})();
"
```

Expected: 两条记录，`baozimh.com` (priority 0) + `bzmgcn.com` (priority 1)

- [ ] **Step 3: Commit**

```bash
cd "$HOME/zuixinmanhua"
git add apps/server/data/comic-sources.db
git commit -m "fix(baozi): 添加 bzmgcn.com 备用域名"
```

---

### Task 6: 修复 拷贝漫画 (copy) 适配器

**Files:**
- Modify: `apps/server/src/sources/adapters/copy.ts`

**Prerequisites:** Task 1 诊断完成，已知真实 API 结构。

- [ ] **Step 1: 根据 Task 1 诊断结果更新适配器**

基于诊断结果（以真实 API 返回结构为准），更新 `copy.ts`。

**常见模式 — 拷贝漫画通常用 REST API**，如果诊断发现 API 路径变更：

假设诊断发现真实 API 路径为 `/api/v3/search` 等，更新如下：

```typescript
// copy.ts — 更新 search 方法中的 API 路径
async search(query: string): Promise<ComicInfo[]> {
  try {
    // 如果诊断发现路径变更，同步更新
    const { data: resp } = await this.fetch('/api/v3/search', {
      params: { q: query, limit: 20, offset: 0 }
    });
    const json = typeof resp === 'string' ? JSON.parse(resp) : resp;
    // 根据真实字段更新映射
    const list = json.data?.results || json.results || json.data?.list || [];
    return list.map((item: any) => ({
      comicId: String(item.id || item.comic_id || ''),
      title: item.name || item.title || '未知',
      author: item.author || item.author_name || '未知',
      cover: item.cover || item.cover_url || '',
      status: this.mapStatus(item.status),
      description: item.desc || item.description || '',
      lastChapter: item.last_chapter_name || item.lastChapter || '',
      updatedAt: item.updated_at || item.updatedAt || '',
      source: this.id,
    }));
  } catch { return []; }
}
```

**注意：** 真实字段名以 Task 1 curl 抓到的 JSON 为准。上面的字段列表覆盖了拷贝漫画常见的几种 API 格式（`camelCase` 和 `snake_case`）。

- [ ] **Step 2: 同步更新详情/章节/图片方法**

更新 `getComicDetail`, `getChapters`, `getChapterImages` 中的 API 路径和字段映射，保持和搜索一致的风格。

- [ ] **Step 3: 更新 testTargets**

用从 Task 1 curl 中获取的真实 comicId：

```typescript
testTargets = { comicId: '<真实comicId>', chapterId: '<真实chapterId>' };
```

- [ ] **Step 4: Commit**

```bash
cd "$HOME/zuixinmanhua"
git add apps/server/src/sources/adapters/copy.ts
git commit -m "fix(copy): 根据真实 API 结构重写适配器"
```

---

### Task 7: 修复 动漫之家 (dongmanzhijia) 适配器

**Files:**
- Modify: `apps/server/src/sources/adapters/dongmanzhijia.ts`

**Prerequisites:** Task 2 诊断完成。

- [ ] **Step 1: 根据诊断结果更新 cheerio 选择器**

当前选择器问题：`.cartoon-item, .search-result-item, .comic-item` 可能不匹配真实 DOM。

以 Task 2 抓取的真实 HTML class 名为准，更新 `search` 方法。示例模式（以实际诊断为准）：

```typescript
// 假设诊断发现搜索卡片 class 为 .search-result-card
async search(query: string): Promise<ComicInfo[]> {
  try {
    const { data } = await this.fetch('/search', { params: { keyword: query } });
    const $ = cheerio.load(data);
    const results: ComicInfo[] = [];
    // 更新为真实 CSS 选择器
    $('.search-result-card, .comic-card, .mh-item').each((_, el) => {
      const $el = $(el);
      const $link = $el.find('a').first();
      const href = $link.attr('href') || '';
      results.push({
        comicId: this.extractId(href),
        title: $el.find('.card-title, .comic-title, h3').first().text().trim(),
        author: $el.find('.card-author, .author').first().text().trim() || '未知',
        cover: $el.find('img').first().attr('src') || $el.find('img').first().attr('data-src') || '',
        status: 'ongoing',
        description: '',
        lastChapter: $el.find('.card-chapter, .latest-chapter').first().text().trim(),
        updatedAt: $el.find('.card-date, .update-time').first().text().trim(),
        source: this.id,
      });
    });
    return results;
  } catch { return []; }
}
```

**关键修复项（以诊断为准）：**
- 选择器：更新为真实 CSS class
- URL 模式：`/info/xxx.html` vs `/comic/xxx` vs 其他
- 图片：注意 `data-src` 懒加载（动漫之家常用）

- [ ] **Step 2: 如果站点已改用 API JSON 模式**

如果 Task 2 发现 `dmzj.com/api/` 返回 JSON，则改为 JSON API 模式（像 copy.ts 那样），不再用 cheerio。

- [ ] **Step 3: 同步更新 getComicDetail / getChapters / getChapterImages**

- [ ] **Step 4: 更新 testTargets**

```typescript
testTargets = { comicId: '<真实comicId>' };
```

- [ ] **Step 5: Commit**

```bash
cd "$HOME/zuixinmanhua"
git add apps/server/src/sources/adapters/dongmanzhijia.ts
git commit -m "fix(dongmanzhijia): 根据真实 DOM 重写选择器"
```

---

### Task 8: 修复 漫蛙 (manwa) 超时

**Files:**
- Modify: `apps/server/data/comic-sources.db` (request_config 或域名)

**Prerequisites:** Task 3 诊断完成。

**场景 A — 网站可达就是慢：**

- [ ] **Step A1: 调大超时 + 添加重试**

```bash
cd "$HOME/zuixinmanhua/apps/server" && node -e "
const initSqlJs = require('sql.js');
const fs = require('fs');
(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('data/comic-sources.db');
  const db = new SQL.Database(buf);
  // 更新 timeout: 20000ms, retries: 2
  const newConfig = JSON.stringify({timeout:20000,userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0.0.0',retries:2});
  db.run('UPDATE source_configs SET request_config = ? WHERE source_id = ?', [newConfig, 'manwa']);
  const data = db.export();
  fs.writeFileSync('data/comic-sources.db', Buffer.from(data));
  console.log('✅ manwa timeout 调整为 20s');
})();
"
```

**场景 B — 网站返回 200 但选择器不匹配：**

- [ ] **Step B1: 更新适配器选择器**（方法同 Task 7）

**场景 C — 网站不可达，需要找替代域名：**

- [ ] **Step C1: 禁用旧域名，添加新域名**

```bash
cd "$HOME/zuixinmanhua/apps/server" && node -e "
const initSqlJs = require('sql.js');
const fs = require('fs');
(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('data/comic-sources.db');
  const db = new SQL.Database(buf);
  db.run(\"UPDATE source_domains SET is_active = 0 WHERE source_id='manwa' AND url='https://manwa.com'\");
  db.run(\"INSERT INTO source_domains (source_id, url, priority, is_active, note) VALUES ('manwa', '<新域名>', 0, 1, '替换域名')\");
  const data = db.export();
  fs.writeFileSync('data/comic-sources.db', Buffer.from(data));
  console.log('✅ 已更换域名');
})();
"
```

**场景 D — 所有域名不可达：**

```bash
cd "$HOME/zuixinmanhua/apps/server" && node -e "
const initSqlJs = require('sql.js');
const fs = require('fs');
(async () => {
  const SQL = await initSqlJs();
  const buf = fs.readFileSync('data/comic-sources.db');
  const db = new SQL.Database(buf);
  db.run(\"UPDATE source_configs SET tier = 'disabled', enabled = 0 WHERE source_id = 'manwa'\");
  const data = db.export();
  fs.writeFileSync('data/comic-sources.db', Buffer.from(data));
  console.log('⚠️ manwa 已禁用');
})();
"
```

- [ ] **Step final: Commit**

```bash
cd "$HOME/zuixinmanhua"
git add apps/server/data/comic-sources.db
git commit -m "fix(manwa): 修复超时 — $(cat <<'EOF'
根据诊断结果的修复说明
EOF
)"
```

---

### Task 9: 修复 野蛮漫画 (yeman) 超时

**Files:**
- Modify: `apps/server/data/comic-sources.db`

**Prerequisites:** Task 4 诊断完成。

方法同 Task 8（4 种场景）。按 Task 4 诊断结果选择对应场景执行。

- [ ] **Step 1: 按诊断结果执行修复**

- [ ] **Step 2: Commit**

---

### Task 10: Phase 3 — 启动后端并端到端验证

**Files:** 不修改

- [ ] **Step 1: 启动后端**

```bash
cd "$HOME/zuixinmanhua/apps/server"
rm -f tsconfig.tsbuildinfo
npx tsc --project tsconfig.json --outDir dist
node dist/main.js &
sleep 3
echo "后端已启动"
```

- [ ] **Step 2: 逐源运行健康检测**

```bash
# 对 5 个源逐一测
for src in copy baozi dongmanzhijia manwa yeman; do
  echo "=== $src ==="
  curl -s "http://localhost:3001/api/health/$src" | head -c 500
  echo ""
done
```

Expected: 全部 healthy 或 degraded（至少不为 unhealthy）

- [ ] **Step 3: 端到端搜索测试**

```bash
# 搜索 "斗罗"
curl -s "http://localhost:3001/api/search?q=斗罗" | head -c 3000
```

Expected: 至少 3 个源返回结果，copy 和 dongmanzhijia 不再返回 0 条

- [ ] **Step 4: 端到端详情+章节测试**

用搜索返回的 comicId 和 chapterId 测每个源的详情和章节：

```bash
# copy
curl -s "http://localhost:3001/api/comic/copy/<comicId>" | head -c 1000
curl -s "http://localhost:3001/api/chapter/copy/<comicId>/<chapterId>" | head -c 1000

# dongmanzhijia
curl -s "http://localhost:3001/api/comic/dongmanzhijia/<comicId>" | head -c 1000

# baozi
curl -s "http://localhost:3001/api/comic/baozi/douluodalu-fengxuandongman" | head -c 1000
```

- [ ] **Step 5: 记录验证结果**

记录每个源的搜索结果数、是否有错误。如果某个源仍失败，回到对应 Task 重新诊断修复。

---

### Task 11: 启动前端手动验证

**Files:** 不修改

- [ ] **Step 1: 启动前端**

```bash
cd "$HOME/zuixinmanhua/apps/web"
npx next dev -p 3000 &
sleep 5
echo "前端已启动: http://localhost:3000"
```

- [ ] **Step 2: 手动验证以下页面**

1. 首页 http://localhost:3000 — 正常加载
2. 搜索 http://localhost:3000/search?q=斗罗 — 多个源有结果
3. 漫画详情 — 从搜索结果点击进入
4. 阅读器 — 从详情页点击章节进入

- [ ] **Step 3: 修复验证中发现的前端问题（如有）**

- [ ] **Step 4: 最终 commit（如有前端修复）**
