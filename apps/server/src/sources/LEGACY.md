# LEGACY

此目录包含旧书源系统，仅供 `source-platform/legacy-bridge/` 使用。

## 禁止新业务直接 import

以下文件不得被 search/comic/chapter/ota/rule-based/rule-source-admin 直接引用：

- `adapter-factory.service.ts`
- `source-parser.ts`
- `source-store.ts`
- `sources.service.ts`
- `adapters/*`

## 允许的引用路径

- `source-platform/legacy-bridge/` — 唯一的桥接层
- `source-platform/runtime/adapter-source-driver.ts` — 旧适配器包装
- `source-platform/runtime/rule-source-driver.ts` — 旧解析器包装

## 数据迁移

`data/sources.json` → 运行 `node scripts/migrate-sources.js` → `data/source-platform/registry/`

迁移日期: 2026-06-29
