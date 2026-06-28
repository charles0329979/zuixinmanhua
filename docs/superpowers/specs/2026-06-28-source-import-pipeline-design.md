# 皮皮喵/GitHub 漫画书源仓库 → OTA Stable 完整导入管道

## 设计文档

> 创建时间: 2026-06-28
> 状态: 待审核

---

## 一、现状分析：应复用的真实模块与文件

### 1.1 可直接复用的模块

| 现有文件 | 复用方式 | 复用内容 |
|---------|---------|---------|
| `apps/server/src/sources/source-parser.ts` (550行) | 直接调用 | `searchBySource()`, `getDetailBySource()`, `getChaptersBySource()`, `getImagesBySource()` — Layer 2/3 验证的核心 |
| `apps/server/src/sources/source-store.ts` (123行) | 扩展方法 | sourceStore 单例：`getSources`, `importSources`, `toggleSource`, `getById` — 需要新增 `setWeight`, `bulkUpdate` |
| `apps/server/src/health/health.service.ts` (227行) | 参考架构 | 5项并行检测模式 — Layer 3 可直接复用其检测逻辑 |
| `apps/server/src/proxy/proxy.service.ts` | Layer 3 验证用 | `fetchAndProxy()` — 验证图片是否可代理 |
| `apps/server/src/sources/legado-importer.ts` (124行) | Layer 0 格式识别 | `convertLegadoToMangaSource()` — Legado→MangaSource 转换 |
| `apps/server/src/sources/comicfs-importer.ts` (174行) | Layer 0 格式识别 | `convertOne()`, `parseComicfsSelector()` — ComicFS→MangaSource 转换 |
| `apps/server/src/ota/ota.controller.ts` (106行) | 扩展字段 | 现有 `GET /api/ota/manifest|index|source/:id` — 需加 channel/healthScore/origin |
| `apps/server/src/sources/js-engine.service.ts` | 能力检测 | 检测源是否需要 JS 引擎 → 标记 `requiresJs` |
| `apps/server/src/sources/circuit-breaker.service.ts` | Layer 1 探测 | `detectBlockPattern()` — 检测反爬页面 |
| `packages/types/src/source.ts` | 扩展 | `MangaSource`, `SourceSearchRule` 等 — 新增 origin/capabilities/status |
| `packages/types/src/health.ts` | 扩展 | `SourceHealthStatus`, `HealthCheckResult` — 新增验证结果类型 |
| `packages/source-core/src/rule-engine/rule-based-adapter.ts` | 参考 | RuleBasedAdapter 实现 — 理解规则执行逻辑 |

### 1.2 现有 validate 模块（我上次写的半成品）

| 文件 | 状态 | 处理 |
|------|------|------|
| `apps/server/src/validate/validate.module.ts` | 已创建，未注册 | **重写** — 融入新的 source-import 体系 |
| `apps/server/src/validate/validate.service.ts` (345行) | 已创建，可用 | **迁移** — Layer1+Layer2 逻辑迁移到新模块 |

---

## 二、发现的架构风险

### 2.1 类型重复定义 ⚠️ 高优先级

**问题：** `MangaSource` 在两个地方定义：
- `packages/types/src/source.ts` — 简化版，缺少 `jsRules`, `imagesApi`, `allowInsecureSSL`
- `apps/server/src/sources/source-store.ts` — 完整版，有额外字段

**风险：** server 的 `source-parser.ts` 使用 `source-store.ts` 的类型，但 OTA/Web/Mobile 使用 packages/types 的类型。新增字段时容易不一致。

**解决方案：** 将 source-store.ts 的完整 MangaSource 类型上提到 `packages/types/src/source.ts`，统一来源。

### 2.2 sourceStore 缺少关键方法 ⚠️ 中优先级

**问题：** `sourceStore` 没有：
- `setWeight(id, weight)` — 评分后设置权重
- `bulkUpdate(updates[])` — 批量更新（验证后需要）
- `getByStatus(status)` — 按状态筛选
- `importWithOrigin(list, origin)` — 带来源信息的导入

**解决方案：** 扩展 sourceStore，保持向后兼容。

### 2.3 OTA 缺少版本/哈希/渠道管理 ⚠️ 中优先级

**问题：** 当前 OTA 直接把所有 sources.json 内容下发，没有：
- stable/beta/quarantine 渠道分离
- 源版本哈希校验
- 回滚能力
- 源更新历史

**解决方案：** OTA stable channel 改为从 `data/source-registry/stable/` 读取，而不是直接从 sources.json。

### 2.4 ValidateModule 未注册到 AppModule ⚠️ 低优先级

上次创建的 validate 模块没有在 app.module.ts 中注册。

---

## 三、精确的新增文件列表与修改文件列表

### 3.1 新增文件（packages/types 共享类型）

```
packages/types/src/source-origin.ts        # SourceOrigin, SourceCapabilities, SourceLifecycleStatus
packages/types/src/source-validation.ts    # SourceValidationResult, SourceHealthScore, ImportedSourceCandidate
packages/types/src/source-canonical.ts     # CanonicalSourceDefinition (标准化中间格式)
```

### 3.2 新增文件（Server 模块）

```
# 主模块
apps/server/src/modules/source-import/
  source-import.module.ts                  # 模块注册，导入所有子模块
  source-import.controller.ts             # 管理API端点

# 远程仓库
apps/server/src/modules/source-import/remote-repository/
  repository-client.service.ts            # GitHub Raw / API 拉取
  repository-mirror.service.ts           # 本地镜像 + commit SHA追踪
  repository-manifest.service.ts         # 仓库配置管理

# 格式识别 + 标准化
apps/server/src/modules/source-import/pipimiao/
  pipimiao-format-detector.service.ts     # 格式自动识别（Legado/ComicFS/皮皮喵/JSON数组）
  pipimiao-normalizer.service.ts          # 确定性标准化 → CanonicalSourceDefinition
  pipimiao-importer.service.ts           # 编排导入流程

# 验证管道
apps/server/src/modules/source-import/validation/
  source-static-lint.service.ts           # Layer 0: 静态校验
  source-network-validator.service.ts    # Layer 1: 网络可达性
  source-search-validator.service.ts     # Layer 2: 搜索验证
  source-chain-validator.service.ts      # Layer 3: 全链路验证
  source-score.service.ts               # 评分 + 推荐

# 分层与发布
apps/server/src/modules/source-import/promotion/
  source-promotion.service.ts            # 状态机转换 + promote逻辑
  source-release.service.ts             # stable OTA 发布
  source-quarantine.service.ts          # 隔离管理

# LLM 辅助（可选，默认关闭）
apps/server/src/modules/source-import/llm/
  deepseek-rule-assistant.service.ts    # DeepSeek 字段映射（禁用时无操作）
  deepseek-rule-assistant.types.ts      # LLM 输入输出类型
```

### 3.3 新增目录（数据存储）

```
apps/server/data/source-registry/
  raw/                                   # 原始下载快照
    {provider}/{repo-id}/{commit-sha}/
      *.json                             # 原始文件，文件名 = 原始hash
  candidates/                            # 候选源（待验证）
  quarantine/                            # 隔离源
  stable/                                # 已发布源（OTA stable channel读取此目录）
  reports/                               # 导入运行报告 + 单源验证报告
  manifests/                             # 仓库 manifest 缓存
```

### 3.4 修改文件

| 文件 | 修改内容 | 复杂度 |
|------|---------|--------|
| `packages/types/src/index.ts` | 新增 barrel export | 低 |
| `packages/types/src/source.ts` | 上提完整 MangaSource 类型，新增 `origin`, `capabilities`, `lifecycleStatus`, `validation`, `healthScore` 可选字段 | 中 |
| `apps/server/src/sources/source-store.ts` | 新增 `setWeight()`, `bulkUpdate()`, `getByStatus()`, `importWithOrigin()` 方法 | 低 |
| `apps/server/src/ota/ota.controller.ts` | stable channel 改为从 `data/source-registry/stable/` 读取；增加 channel/healthScore/origin/hash 字段 | 中 |
| `apps/server/src/app.module.ts` | 注册 SourceImportModule | 低 |
| `apps/server/src/validate/` | 删除旧的 validate.service.ts 和 validate.module.ts（逻辑已迁移） | 低 |
| `packages/ota-sources/src/index.ts` | 如需客户端同步逻辑，扩展 SourceRegistry 支持 channel 过滤 | 低 |

---

## 四、数据流图

```
                          ┌──────────────────────────┐
                          │  环境变量配置              │
                          │  SOURCE_IMPORT_REPOSITORIES│
                          └────────────┬─────────────┘
                                       │
                                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Repository Client                             │
│  GitHub Raw/API → 下载原始文件 → 保存到 raw/{provider}/{repo}/{sha}/ │
│  - 记录 commit SHA                                                   │
│  - 计算文件 hash                                                     │
│  - 同 commit 不重复导入                                               │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        Format Detector                               │
│  识别格式: Legado数组 | Legado单源 | ComicFS | 皮皮喵旧格式 | JSON数组│
│  无法识别 → DISCOVERED → MANUAL_REVIEW                               │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Deterministic Normalizer                          │
│  外部格式 → CanonicalSourceDefinition (中间格式)                      │
│  保留原始规则 | 记录字段映射 | 输出 warnings | 保留无法映射字段        │
│  失败 → PARSED → MANUAL_REVIEW                                       │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │ 可选: DeepSeek 辅助映射  │
                    │ (默认关闭, 仅当          │
                    │  确定性映射失败时触发)    │
                    └────────────┬────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│               Canonical → MangaSource 转换                            │
│  存入 candidates/ 目录                                               │
│  状态: PARSED → PENDING_VALIDATE                                     │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Layer 0: Static Lint                             │
│  ID/URL 完整性 | 协议白名单 | 域名黑名单 | 选择器语法 | 危险scheme     │
│  失败 → STATIC_REJECTED (记录原因)                                    │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Layer 1: Network Validator                        │
│  DNS → TCP → SSL → HTTP HEAD → Content-Type → 反爬检测               │
│  失败 → QUARANTINED                                                   │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Layer 2: Search Validator                         │
│  用可配置关键词池搜索 → 至少1个结果 → 标题/URL不为空                   │
│  失败 → QUARANTINED                                                   │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Layer 3: Chain Validator                          │
│  搜索 → 详情 → 章节列表 → 第一章 → 第一张图 → ProxyModule验证        │
│  全部通过 → VERIFIED                                                  │
│  任何失败 → QUARANTINED 或 MANUAL_REVIEW (视失败类型)                  │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                     Source Score                                      │
│  静态15 + 网络15 + 搜索20 + 详情15 + 章节15 + 图片15 + 速度5 = 100    │
│                                                                       │
│  图片失败 → 绝不可 PROMOTED                                           │
│  总分 < 70 → QUARANTINED                                              │
│  70-84 → VERIFIED (不进入 stable)                                     │
│  >= 85 且全链路通过 → PROMOTED                                        │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │                         │
                    ▼                         ▼
    ┌───────────────────────┐   ┌───────────────────────┐
    │  PROMOTED → stable/   │   │  其他状态 →            │
    │  写入 stable/ 目录     │   │  quarantine/ 或        │
    │  OTA Stable Channel   │   │  candidates/           │
    │  可被客户端同步        │   │  不进入 OTA            │
    └───────────────────────┘   └───────────────────────┘
```

---

## 五、数据模型设计

### 5.1 新增共享类型 (packages/types)

```typescript
// === source-origin.ts ===

export interface SourceOrigin {
  provider: 'pipimiao' | 'github' | 'manual' | 'legado' | 'comicfs';
  repositoryUrl: string;
  branch?: string;
  commitSha?: string;
  filePath: string;
  importedAt: string;
  rawHash: string;           // SHA256 of original file
}

export interface SourceCapabilities {
  search: boolean;
  detail: boolean;
  chapters: boolean;
  images: boolean;
  requiresJs: boolean;
  requiresLogin: boolean;
  requiresManualAdapter: boolean;
}

export type SourceLifecycleStatus =
  | 'DISCOVERED'
  | 'PARSED'
  | 'UNSUPPORTED'
  | 'STATIC_REJECTED'
  | 'PENDING_VALIDATE'
  | 'VALIDATING'
  | 'QUARANTINED'
  | 'MANUAL_REVIEW'
  | 'VERIFIED'
  | 'PROMOTED'
  | 'DISABLED';

// === source-validation.ts ===

export interface SourceValidationResult {
  staticPassed: boolean;
  networkPassed: boolean;
  searchPassed: boolean;
  detailPassed: boolean;
  chaptersPassed: boolean;
  imagesPassed: boolean;
  proxyPassed: boolean;
  latencyMs?: number;
  errorCode?: string;
  errorMessage?: string;
  testedAt: string;
}

export interface SourceHealthScore {
  total: number;              // 0-100
  staticScore: number;        // 0-15
  networkScore: number;       // 0-15
  searchScore: number;        // 0-20
  detailScore: number;        // 0-15
  chapterScore: number;       // 0-15
  imageScore: number;         // 0-15
  latencyScore: number;       // 0-5
  recommendation: 'PROMOTE' | 'QUARANTINE' | 'MANUAL_REVIEW';
}

export interface ImportedSourceCandidate {
  id: string;
  name: string;
  normalizedSource: unknown;   // MangaSource 完整定义
  origin: SourceOrigin;
  capabilities: SourceCapabilities;
  lifecycleStatus: SourceLifecycleStatus;
  validation?: SourceValidationResult;
  health?: SourceHealthScore;
  conversionWarnings: string[];
  createdAt: string;
  updatedAt: string;
}

// === source-canonical.ts ===

// 标准化中间格式 — 所有外部格式先映射到此
export interface CanonicalSourceDefinition {
  id: string;
  name: string;
  host: string;
  language: string;
  
  // 四个阶段的规则（标准化字段名）
  search: CanonicalRuleSection;
  detail: CanonicalRuleSection;
  chapters: CanonicalRuleSection;
  images: CanonicalRuleSection;
  
  // 元数据
  headers?: Record<string, string>;
  timeoutMs?: number;
  
  // 原始规则（保留，用于调试和审计）
  rawRules: unknown;
  
  // 字段映射记录（原始字段 → 标准字段）
  fieldMappings: FieldMapping[];
  
  // 无法映射的字段（不静默丢弃）
  unmappedFields: UnmappedField[];
  
  // 标准化过程中产生的警告
  warnings: string[];
  
  // 能力标记
  capabilities: SourceCapabilities;
}

export interface CanonicalRuleSection {
  url: string;
  method: 'GET' | 'POST';
  responseType: 'html' | 'json';
  listSelector: string;
  itemSelectors: Record<string, string>;  // title, cover, url, etc.
}

export interface FieldMapping {
  rawPath: string;
  canonicalField: string;
  method: 'direct' | 'regex' | 'template' | 'llm-assisted';
  confidence: number;  // 0-1
}

export interface UnmappedField {
  rawPath: string;
  rawValue: unknown;
  reason: string;
}
```

### 5.2 扩展 MangaSource (修改 packages/types/src/source.ts)

在 MangaSource 接口中新增可选字段（向后兼容）：

```typescript
export interface MangaSource {
  // ... 现有字段保持不变 ...
  
  // === 新增：溯源 + 验证 + 发布字段 ===
  origin?: SourceOrigin;
  capabilities?: SourceCapabilities;
  lifecycleStatus?: SourceLifecycleStatus;
  validation?: SourceValidationResult;
  healthScore?: SourceHealthScore;
  conversionWarnings?: string[];
}
```

### 5.3 导入运行报告

```typescript
export interface ImportRunReport {
  runId: string;
  repositoryId: string;
  repositoryUrl: string;
  branch: string;
  commitSha: string;
  startedAt: string;
  completedAt: string;
  
  // 统计数据
  filesScanned: number;
  sourcesDiscovered: number;
  sourcesParsed: number;
  staticRejected: number;
  networkFailed: number;
  searchFailed: number;
  fullChainPassed: number;
  promoted: number;
  quarantine: number;
  manualReview: number;
  
  // 错误分布
  errors: { stage: string; count: number; sample: string }[];
  
  // 每个候选源的独立报告引用
  candidateReports: string[];  // 文件路径
  
  totalDurationMs: number;
}
```

---

## 六、关键设计决策

### 6.1 OTA stable channel 数据源切换

**当前:** OTAController 从 sourceStore (sources.json) 读全量数据
**改为:** OTAController stable channel 从 `data/source-registry/stable/` 目录读

**兼容性:** 保留现有 `/api/ota/manifest|index|source/:id` 接口不变。新增 `channel` 查询参数：
- `GET /api/ota/index?channel=stable` → 仅返回 stable 源
- `GET /api/ota/index?channel=all` → 返回所有（旧行为，默认）

### 6.2 不破坏现有源

现有的 baozi (硬编码), manwa, yydsmh 等已可用的源：
- 硬编码适配器源不受影响（它们不经过 OTA）
- 规则源中已被验证可用的（baozi规则源、yydsmh）不会被删除/覆盖
- 导入管道只处理从外部仓库新导入的源

### 6.3 LLM 集成的安全边界

DeepSeekRuleAssistantService：
- 通过环境变量 `SOURCE_IMPORT_LLM_ENABLED` 控制，默认 `false`
- 仅在"确定性映射失败 + 原始结构合法"时触发
- 输入仅为最小规则片段（不含用户数据/Cookie/Token）
- 输出仅作为"候选建议"，标记 `MANUAL_REVIEW`
- 所有调用记录审计日志到 `reports/llm-audit/`

---

## 七、分阶段实施计划

### Phase 1: 共享类型 + 数据模型 + 存储基础 (预计 1-2h)
- [ ] 新增 `packages/types/src/source-origin.ts`
- [ ] 新增 `packages/types/src/source-validation.ts`
- [ ] 新增 `packages/types/src/source-canonical.ts`
- [ ] 扩展 `packages/types/src/source.ts` (MangaSource 新增可选字段)
- [ ] 更新 `packages/types/src/index.ts` barrel export
- [ ] 扩展 `source-store.ts` (新增方法)
- [ ] 创建 `data/source-registry/` 目录结构

### Phase 2: 仓库镜像 + 格式识别 + 标准化 (预计 2-3h)
- [ ] `repository-client.service.ts` — GitHub Raw 拉取
- [ ] `repository-mirror.service.ts` — 本地镜像 + SHA跟踪
- [ ] `repository-manifest.service.ts` — 仓库配置
- [ ] `pipimiao-format-detector.service.ts` — 格式自动识别
- [ ] `pipimiao-normalizer.service.ts` — 确定性标准化
- [ ] `pipimiao-importer.service.ts` — 编排导入

### Phase 3: 验证管道 Layer 0-3 (预计 2-3h)
- [ ] `source-static-lint.service.ts` — 静态校验
- [ ] `source-network-validator.service.ts` — 网络可达性
- [ ] `source-search-validator.service.ts` — 搜索验证
- [ ] `source-chain-validator.service.ts` — 全链路验证
- [ ] `source-score.service.ts` — 评分

### Phase 4: 状态机 + 分层发布 (预计 1-2h)
- [ ] `source-promotion.service.ts` — 状态机
- [ ] `source-release.service.ts` — stable 发布
- [ ] `source-quarantine.service.ts` — 隔离管理

### Phase 5: OTA 桥接 + 管理 API (预计 1-2h)
- [ ] 修改 `ota.controller.ts` — stable channel
- [ ] `source-import.controller.ts` — 管理端点
- [ ] 注册到 AppModule

### Phase 6: LLM 辅助（可选，默认关闭）(预计 1h)
- [ ] `deepseek-rule-assistant.service.ts`
- [ ] Mock 测试

### Phase 7: 测试 + 文档 + 运行验证 (预计 1-2h)
- [ ] 集成测试
- [ ] 导入报告示例
- [ ] 环境变量说明
- [ ] 端到端运行验证

---

## 八、Phase 1 准备提交的代码

确认方案后，我将先提交 Phase 1：
1. 3 个新类型文件 (packages/types/src/)
2. 1 个类型扩展 (packages/types/src/source.ts)
3. 1 个 barrel export 更新
4. 1 个 source-store.ts 扩展
5. 目录结构创建

**不改动任何现有功能代码。**

---

*请审核此方案。确认后我将按 Phase 1 开始输出可落地的代码。*
