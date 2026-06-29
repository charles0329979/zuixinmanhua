// ============================================================
// apps/server/src/modules/source-import/source-import.module.ts
// 源导入管道模块 — 注册所有导入管道服务和控制器
// ============================================================

import { Module } from '@nestjs/common';
import { ProxyModule } from '../../proxy/proxy.module';
import { SourcePlatformModule } from '../../source-platform/source-platform.module';
import { SourceImportController } from './source-import.controller';
import { SourceImportService } from './source-import.service';

// Remote Repository
import { RepositoryClientService } from './discovery/github-repository-client.service';
import { RepositoryMirrorService } from './discovery/repository-mirror.service';
import { RepositoryManifestService } from './discovery/repository-manifest.service';

// Pipimiao (Format Detection + Normalization + Binary Parser)
import { PipimiaoFormatDetectorService } from './parsing/source-format-detector.service';
import { PipimiaoNormalizerService } from './parsing/canonical-source-normalizer.service';
import { PipimiaoImporterService } from './parsing/source-importer.service';
import { PpcatBinaryParserService } from './parsing/pipimiao-parser.service';

// Validation
import { SourceStaticLintService } from './validation/source-static-validator.service';
import { SourceNetworkValidatorService } from './validation/source-network-validator.service';
import { SourceSearchValidatorService } from './validation/source-search-validator.service';
import { SourceChainValidatorService } from './validation/source-chain-validator.service';
import { SourceScoreService } from './validation/source-health-score.service';

// Promotion
import { SourcePromotionService } from './release/source-promotion.service';
import { SourceReleaseService } from './registry/source-stable-store.service';
import { SourceQuarantineService } from './registry/source-quarantine-store.service';

// LLM Assistant
import { DeepSeekRuleAssistantService } from './llm/deepseek-rule-assistant.service';

@Module({
  imports: [ProxyModule, SourcePlatformModule],
  controllers: [SourceImportController],
  providers: [
    // Orchestration
    SourceImportService,

    // Remote Repository
    RepositoryClientService,
    RepositoryMirrorService,
    RepositoryManifestService,

    // Format Detection + Normalization + Binary Parser
    PipimiaoFormatDetectorService,
    PipimiaoNormalizerService,
    PipimiaoImporterService,
    PpcatBinaryParserService,

    // Validation
    SourceStaticLintService,
    SourceNetworkValidatorService,
    SourceSearchValidatorService,
    SourceChainValidatorService,
    SourceScoreService,

    // Promotion
    SourcePromotionService,
    SourceReleaseService,
    SourceQuarantineService,

    // LLM (default disabled)
    DeepSeekRuleAssistantService,
  ],
  exports: [
    SourceImportService,
    SourceReleaseService,
    SourceQuarantineService,
    RepositoryManifestService,
  ],
})
export class SourceImportModule {}
