// ============================================================
// source-platform/source-platform.module.ts
// SourcePlatformModule — 书源平台唯一入口模块 (V6)
//
// 目录结构:
//   runtime/       — 驱动注册 + 接口定义 + 错误类型
//   execution/     — search/detail/chapters/images 执行器
//   registry/      — 生命周期 + manifest + 版本
//   release/       — promotion + quarantine + rollback
//   validation/    — 全链路验证
//   import/        — 已知仓库导入
//   legacy-bridge/ — 旧系统桥接 (仅启动时使用)
//   admin/         — 后台管理控制器
//
// onApplicationBootstrap:
//   1. 通过 legacy-bridge 加载旧适配器 + 规则源
//   2. 全部注册到 DriverRegistryService
//   3. 自动发布所有驱动到 stable
// ============================================================

import { Module, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { SourcesModule } from '../sources/sources.module';

// ---- runtime ----
import { DriverRegistryService } from './runtime/driver-registry.service';
import { SourceRuntimeService } from './runtime/source-runtime.service';

// ---- execution ----
import { SearchExecutor } from './execution/search.executor';
import { DetailExecutor } from './execution/detail.executor';
import { ChaptersExecutor } from './execution/chapters.executor';
import { ImagesExecutor } from './execution/images.executor';

// ---- image-engine ----
import { ImageEngine } from './execution/image-engine/image-engine.service';
import { AdapterDelegateStrategy } from './execution/image-engine/strategies/adapter-delegate.strategy';
import { XhrApiStrategy } from './execution/image-engine/strategies/xhr-api.strategy';
import { CssSelectorStrategy } from './execution/image-engine/strategies/css-selector.strategy';
import { LazyAttributeStrategy } from './execution/image-engine/strategies/lazy-attribute.strategy';
import { JsonInlineStrategy } from './execution/image-engine/strategies/json-inline.strategy';
import { BackgroundImageStrategy } from './execution/image-engine/strategies/background-image.strategy';

// ---- registry ----
import { SourceRegistryService } from './registry/source-registry.service';
import { SourceLifecycleService } from './registry/source-lifecycle.service';
import { SourceManifestService } from './registry/source-manifest.service';
import { SourceVersionService } from './registry/source-version.service';

// ---- release ----
import { SourcePromotionService } from './release/source-promotion.service';
import { SourceQuarantineService } from './release/source-quarantine.service';
import { RollbackService } from './release/rollback.service';

// ---- validation ----
import { SourceValidationService } from './validation/source-validation.service';

// ---- legacy-bridge ----
import { LegacyAdapterLoaderService } from './legacy-bridge/legacy-adapter-loader.service';
import { LegacyRuleParserWrapperService } from './legacy-bridge/legacy-rule-parser-wrapper.service';

// ---- import ----
import { SourceImportService } from './import/source-import.service';
import { SourceImportController } from './import/source-import.controller';
import { PipimiaoFormatDetectorService } from './import/source-format-detector.service';
import { PipimiaoNormalizerService } from './import/canonical-source-normalizer.service';
import { PpcatBinaryParserService } from './import/pipimiao-parser.service';

// ---- facade ----
import { SourcePlatformService } from './source-platform.service';

// ---- admin ----
import { SourceRegistryController } from './registry/source-registry.controller';

@Module({
  imports: [SourcesModule],
  controllers: [SourceRegistryController, SourceImportController],
  providers: [
    // runtime
    DriverRegistryService,
    SourceRuntimeService,
    // execution
    SearchExecutor,
    DetailExecutor,
    ChaptersExecutor,
    ImagesExecutor,
    // image-engine
    ImageEngine,
    AdapterDelegateStrategy,
    XhrApiStrategy,
    CssSelectorStrategy,
    LazyAttributeStrategy,
    JsonInlineStrategy,
    BackgroundImageStrategy,
    // registry
    SourceRegistryService,
    SourceLifecycleService,
    SourceManifestService,
    SourceVersionService,
    // release
    SourcePromotionService,
    SourceQuarantineService,
    RollbackService,
    // validation
    SourceValidationService,
    // import
    SourceImportService,
    PipimiaoFormatDetectorService,
    PipimiaoNormalizerService,
    PpcatBinaryParserService,
    // legacy-bridge
    LegacyAdapterLoaderService,
    LegacyRuleParserWrapperService,
    // facade
    SourcePlatformService,
  ],
  exports: [
    SourcePlatformService,
    SourceRuntimeService,
    DriverRegistryService,
    SourceRegistryService,
    SourceManifestService,
    SourcePromotionService,
    SourceValidationService,
  ],
})
export class SourcePlatformModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(SourcePlatformModule.name);

  constructor(
    private readonly registry: DriverRegistryService,
    private readonly adapterLoader: LegacyAdapterLoaderService,
    private readonly ruleLoader: LegacyRuleParserWrapperService,
    private readonly promotion: SourcePromotionService,
    private readonly manifest: SourceManifestService,
    private readonly sourceRegistry: SourceRegistryService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Initializing SourcePlatform V6...');

    // Step 1: 加载旧适配器 (manwa, yeman, kanman, ...)
    const adapters = await this.adapterLoader.loadAllEnabled();
    this.registry.registerAll(adapters);
    this.logger.log(`  [adapter] ${adapters.length} drivers loaded`);

    // Step 2: 加载规则源 (sources.json → RuleSourceDriver)
    const ruleDrivers = this.ruleLoader.loadEnabled();
    for (const d of ruleDrivers) {
      if (!this.registry.has(d.sourceId)) {
        this.registry.register(d);
      }
    }
    this.logger.log(`  [rule] ${ruleDrivers.length} drivers available`);

    // Step 3: 数据迁移 (从旧目录 → 新目录)
    this.migrateData();

    // Step 4: 重建 manifest（仅基于 registry/stable/ 中已验证的源）
    // 不再 auto-promote — candidate → stable 必须经过 SourceRuntime 全链路验证
    this.rebuildManifestsFromExistingStable();

    const stats = this.sourceRegistry.getStats();
    this.logger.log(
      `SourcePlatform V6 ready: ${this.registry.count} drivers, ` +
      `${stats.stable} stable, ${stats.candidates} candidates, ` +
      `${stats.quarantine} quarantine, ${stats.manualReview} manual-review`,
    );
  }

  private migrateData(): void {
    const fs = require('fs');
    const path = require('path');
    const oldRoot = path.join(process.cwd(), 'data', 'source-registry');
    const newRegistry = path.join(process.cwd(), 'data', 'source-platform', 'registry');

    const sections = ['stable', 'candidates', 'quarantine', 'manual-review'];
    for (const s of sections) {
      const oldDir = path.join(oldRoot, s);
      const newDir = path.join(newRegistry, s);
      if (!fs.existsSync(oldDir)) continue;
      fs.mkdirSync(newDir, { recursive: true });
      let count = 0;
      for (const f of fs.readdirSync(oldDir).filter((f: string) => f.endsWith('.json'))) {
        const dst = path.join(newDir, f);
        if (!fs.existsSync(dst)) { fs.copyFileSync(path.join(oldDir, f), dst); count++; }
      }
      if (count > 0) this.logger.log(`  migrated ${count} ${s}`);
    }

    this.manifest.rebuildAll(this.promotion.listAllStable());
  }

  /**
   * 从 registry/stable/ 中已存在的已验证源重建 manifest。
   *
   * ★ 不再 auto-promote — candidate → stable 必须经过全链路验证 (SourceValidationService)。
   * 启动时只恢复已验证源，新 driver 不会自动进入 stable。
   */
  private rebuildManifestsFromExistingStable(): void {
    const existingStable = this.promotion.listAllStable();
    if (existingStable.length > 0) {
      this.manifest.rebuildAll(existingStable);
      this.logger.log(`  [stable] ${existingStable.length} existing stable sources loaded (no auto-promote)`);
    } else {
      // 冷启动: 没有 stable 源是正常的 — 需要通过 admin validate + promote 手动添加
      this.logger.warn('  [stable] 0 existing stable sources — use admin API to validate & promote');
      // 仍然写入空 manifest 避免 OTA 读取失败
      this.manifest.rebuildAll([]);
    }
  }
}
