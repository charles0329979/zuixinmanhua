# Fix Source Adapters — 设计文档

**日期**: 2026-06-03
**状态**: 已确认
**范围**: 修复 5 个书源适配器（拷贝漫画、动漫之家、漫蛙、野蛮漫画、包子漫画域名）

---

## 目标

修复所有已知书源适配器问题，使全部 5 个书源达到 healthy 状态。

## 当前状态

| 书源 | Tier | 问题 |
|------|------|------|
| 拷贝漫画 (copy) | core | 搜索返回 0 结果 |
| 动漫之家 (dongmanzhijia) | core | 搜索返回 0 结果 |
| 漫蛙 (manwa) | supplement | 超时 8s+ |
| 野蛮漫画 (yeman) | supplement | 超时 8s+ |
| 包子漫画 (baozi) | core | 需添加 bzmgcn.com 域名 |

## 流程

### Phase 1: 诊断

对每个书源执行 curl 诊断，回答：
1. 网站是否可达（HTTP 200？）
2. 数据在哪里（SSR HTML 还是客户端 API？）
3. 当前适配器选择器为什么失效？

### Phase 2: 分类修复

**域名配置类**（包子漫画、漫蛙、野蛮漫画）:
- 验证/替换域名，更新 `source_domains` 表
- 调整超时配置

**适配器重写类**（拷贝漫画、动漫之家）:
- 以 `6ccbabf`（包子漫画修复）为模板
- 分析真实 HTML/API 结构
- 重写选择器或改用 API JSON 解析
- 更新 `testTargets`

### Phase 3: 验证

对每个修复源：
- `POST /api/health/:source/check` 健康检测
- `GET /api/search?q=测试词` 搜索验证
- `GET /api/comic/:source/:comicId` 详情验证
- `GET /api/chapter/:source/:comicId/:chapterId` 章节图片验证

## 文件变更

| 文件 | 变更类型 |
|------|----------|
| `apps/server/data/comic-sources.db` | 域名/配置更新 |
| `apps/server/src/sources/adapters/copy.ts` | 适配器重写 |
| `apps/server/src/sources/adapters/dongmanzhijia.ts` | 适配器重写 |
| `apps/server/src/sources/adapters/manwa.ts` | 域名修复 |
| `apps/server/src/sources/adapters/yeman.ts` | 域名修复 |
| `apps/server/src/sources/adapters/baozi.ts` | 域名池添加 |

## 修复模板（参考 6ccbabf）

1. `curl -sL "URL" -H "User-Agent: Chrome/131"` 抓取真实页面
2. 对比 cheerio 选择器与真实 DOM/CSS 类名
3. 如站点用 API JSON，改为 `fetch` + JSON 解析
4. 使用站点真实 comicId 作为 `testTargets`
