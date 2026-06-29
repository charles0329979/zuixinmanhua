// ============================================================
// source-platform/legacy-bridge/legacy-rule-parser-wrapper.service.ts
// LegacyRuleParserWrapperService — 旧规则源解析器桥接层
//
// 封装 source-store (数据源) 的读取操作，
// 供 SourcePlatformModule 在启动时加载 sources.json 中的规则源。
// 其他任何模块不得直接导入此 Service。
// ============================================================

import { Injectable } from '@nestjs/common';
import { sourceStore, MangaSource } from '../../sources/source-store';
import { RuleSourceDriver } from '../runtime/rule-source-driver';
import type { ISourceDriver } from '../runtime/source-driver.interface';

@Injectable()
export class LegacyRuleParserWrapperService {
  /** 加载所有启用的规则源，包装为 RuleSourceDriver */
  loadEnabled(): ISourceDriver[] {
    const sources = sourceStore.getEnabledSources();
    return sources.map(source => new RuleSourceDriver(source));
  }

  /** 加载所有规则源 (含未启用的) */
  loadAll(): ISourceDriver[] {
    const sources = sourceStore.getSources();
    return sources.map(source => new RuleSourceDriver(source));
  }

  /** 获取原始 MangaSource 列表 (供迁移使用) */
  getRawSources(): MangaSource[] {
    return sourceStore.getSources();
  }
}
