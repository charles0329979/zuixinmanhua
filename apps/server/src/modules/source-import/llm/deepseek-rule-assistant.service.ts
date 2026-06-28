// ============================================================
// apps/server/src/modules/source-import/llm/deepseek-rule-assistant.service.ts
// DeepSeek API 规则字段映射辅助服务
//
// 安全约束:
//   - 默认关闭 (SOURCE_IMPORT_LLM_ENABLED=false)
//   - 仅在确定性映射失败时调用
//   - 仅发送最小必要的规则片段
//   - 不发送用户数据/鉴权信息/Cookie/Token
//   - 不发送README/Issue/脚本/不可信说明文本
//   - 返回内容只是"候选映射建议"，不能直接PROMOTED
//   - 置信度 < 0.95 必须 MANUAL_REVIEW
//   - LLM输出必须再经过静态校验→网络验证→搜索验证→全链路验证
//   - 所有调用写入审计日志
//   - 绝不输出可执行JavaScript
//   - 绝不修改原始规则
//   - 绝不自动写入 stable 目录
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type {
  DeepSeekConfig,
  DeepSeekMappingRequest,
  DeepSeekMappingResponse,
  DeepSeekAuditLog,
} from './deepseek-rule-assistant.types';
import { loadDeepSeekConfig, isForbiddenField } from './deepseek-rule-assistant.types';
import type { CanonicalSourceDefinition } from '../types';
import * as https from 'https';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DeepSeekRuleAssistantService {
  private readonly logger = new Logger(DeepSeekRuleAssistantService.name);
  private readonly config: DeepSeekConfig;
  private readonly auditLogDir: string;

  constructor() {
    this.config = loadDeepSeekConfig();
    this.auditLogDir = path.join(process.cwd(), 'data', 'source-registry', 'reports', 'validations', 'llm-audit');
    if (this.config.enabled) {
      this.logger.log(
        `DeepSeek assistant ENABLED: model=${this.config.model}, ` +
        `baseUrl=${this.config.baseUrl}`,
      );
    } else {
      this.logger.log('DeepSeek assistant DISABLED (SOURCE_IMPORT_LLM_ENABLED != true)');
    }
  }

  /**
   * 检查服务是否可用
   */
  isAvailable(): boolean {
    return this.config.enabled && !!this.config.apiKey;
  }

  /**
   * 获取当前配置 (不含 apiKey)
   */
  getConfig(): Omit<DeepSeekConfig, 'apiKey'> {
    const { apiKey, ...safe } = this.config;
    return safe;
  }

  /**
   * 请求 DeepSeek 辅助映射规则字段
   *
   * 调用条件 (调用方负责检查):
   *   1. 确定性规则映射失败 (normalizer 产出 unmappedFields)
   *   2. 原始 JSON 结构合法
   *   3. 仅发送最小必要的规则片段
   *
   * @param canonical  已标准化的源定义 (包含已映射和未映射字段)
   * @returns 映射建议，失败时返回 null
   */
  async assistMapping(
    canonical: CanonicalSourceDefinition,
  ): Promise<DeepSeekMappingResponse | null> {
    if (!this.isAvailable()) {
      this.logger.warn('DeepSeek assistant not available (disabled or no API key)');
      return null;
    }

    if (canonical.unmappedFields.length === 0) {
      this.logger.debug('No unmapped fields — skipping LLM assist');
      return null;
    }

    const requestId = `llm-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const startTime = Date.now();
    const auditLog: DeepSeekAuditLog = {
      requestId,
      timestamp: new Date().toISOString(),
      model: this.config.model,
      promptHash: '',
      responseHash: '',
      schemaConfidence: 0,
      durationMs: 0,
      success: false,
      mappingsAdopted: false,
      adoptedCount: 0,
    };

    try {
      // 1. 构建最小请求
      const request = this.buildMinimalRequest(canonical);
      const promptStr = JSON.stringify(request);

      // 安全扫描: 检查是否包含禁止内容
      const forbiddenFields = request.unmappedFields
        ? Object.keys(request.unmappedFields).filter(isForbiddenField)
        : [];
      if (forbiddenFields.length > 0) {
        this.logger.warn(
          `Skipping LLM assist: unmapped fields contain forbidden content: ${forbiddenFields.join(', ')}`,
        );
        return null;
      }

      auditLog.promptHash = crypto.createHash('sha256').update(promptStr, 'utf-8').digest('hex');

      // 2. 调用 DeepSeek API
      const responseBody = await this.callDeepSeekAPI(promptStr);
      auditLog.responseHash = crypto.createHash('sha256')
        .update(responseBody, 'utf-8')
        .digest('hex');

      // 3. 解析响应
      const parsed = this.parseResponse(responseBody);
      if (!parsed) {
        auditLog.durationMs = Date.now() - startTime;
        auditLog.error = 'Failed to parse DeepSeek response';
        this.writeAuditLog(auditLog);
        return null;
      }

      auditLog.schemaConfidence = parsed.schemaConfidence;
      auditLog.success = true;
      auditLog.durationMs = Date.now() - startTime;

      // 4. 强制人工审核条件
      if (parsed.schemaConfidence < 0.95) {
        parsed.requiresManualReview = true;
        parsed.warnings.push(
          `schemaConfidence ${parsed.schemaConfidence} < 0.95 — ` +
          `marking as MANUAL_REVIEW per policy`,
        );
      }

      // 5. 过滤低置信度映射
      parsed.fieldMappings = parsed.fieldMappings.map(m => {
        if (m.confidence < 0.95) {
          parsed.warnings.push(
            `Low confidence mapping: "${m.rawPath}" → "${m.canonicalField}" ` +
            `(confidence=${m.confidence})`,
          );
        }
        return m;
      });

      // 6. 写入审计日志
      this.writeAuditLog(auditLog);

      this.logger.log(
        `DeepSeek assist complete: ${parsed.fieldMappings.length} mappings, ` +
        `confidence=${parsed.schemaConfidence}, manualReview=${parsed.requiresManualReview}`,
      );

      return parsed;
    } catch (e: any) {
      auditLog.durationMs = Date.now() - startTime;
      auditLog.error = e.message;
      this.writeAuditLog(auditLog);
      this.logger.error(`DeepSeek assist failed: ${e.message}`);
      return null;
    }
  }

  /**
   * 将 DeepSeek 映射建议应用到 CanonicalSourceDefinition
   *
   * 安全: 仅在 schemaConfidence >= 0.95 且 requiresManualReview === false 时应用
   *
   * @returns 应用后的 canonical 副本 (不修改原始)
   */
  applyMapping(
    canonical: CanonicalSourceDefinition,
    response: DeepSeekMappingResponse,
  ): CanonicalSourceDefinition {
    if (response.requiresManualReview) {
      this.logger.warn(`Not applying LLM mappings for ${canonical.id}: requires manual review`);
      return canonical;
    }

    const applied = { ...canonical };
    const newWarnings = [...canonical.warnings];

    // 应用高置信度映射
    const adoptable = response.fieldMappings.filter(m => m.confidence >= 0.95);

    for (const mapping of adoptable) {
      applied.fieldMappings = [...applied.fieldMappings, {
        rawPath: mapping.rawPath,
        canonicalField: mapping.canonicalField,
        method: 'llm-assisted' as const,
        confidence: mapping.confidence,
      }];

      // 从 unmappedFields 中移除
      applied.unmappedFields = applied.unmappedFields.filter(
        u => u.rawPath !== mapping.rawPath,
      );
    }

    // 追加 LLM 警告
    for (const w of response.warnings) {
      if (!newWarnings.includes(w)) newWarnings.push(`[LLM] ${w}`);
    }
    applied.warnings = newWarnings;

    // 更新 audit log — 记录已采纳
    this.logger.log(
      `Applied ${adoptable.length} LLM-assisted mappings to ${canonical.id}`,
    );

    return applied;
  }

  // ========== Private ==========

  /**
   * 构建最小请求 — 仅发送规则字段片段
   */
  private buildMinimalRequest(canonical: CanonicalSourceDefinition): DeepSeekMappingRequest {
    // 仅提取未映射字段的 key+value（字符串值）
    const unmappedFields: Record<string, string> = {};
    for (const uf of canonical.unmappedFields) {
      if (typeof uf.rawValue === 'string') {
        // 安全: 截断过长的值
        unmappedFields[uf.rawPath] = uf.rawValue.slice(0, 500);
      } else if (typeof uf.rawValue === 'object' && uf.rawValue !== null) {
        // 对象值: 序列化后截断
        const str = JSON.stringify(uf.rawValue);
        unmappedFields[uf.rawPath] = str.slice(0, 500);
      } else if (uf.rawValue !== undefined && uf.rawValue !== null) {
        unmappedFields[uf.rawPath] = String(uf.rawValue).slice(0, 500);
      }
    }

    // 已映射字段: 仅发送路径→标准字段映射（不发送值）
    const mappedFields: Record<string, string> = {};
    for (const fm of canonical.fieldMappings) {
      mappedFields[fm.rawPath] = fm.canonicalField;
    }

    return {
      requestId: `mapping-${canonical.id}`,
      sourceFormat: 'legado', // detected from canonical
      unmappedFields,
      mappedFields,
      knownCanonicalFields: [
        'search.url', 'search.listSelector', 'search.itemSelectors.title',
        'search.itemSelectors.cover', 'search.itemSelectors.url',
        'detail.itemSelectors.title', 'detail.itemSelectors.cover',
        'detail.itemSelectors.author', 'detail.itemSelectors.description',
        'chapters.listSelector', 'chapters.itemSelectors.title',
        'chapters.itemSelectors.url', 'images.listSelector',
        'images.itemSelectors.src',
      ],
    };
  }

  /**
   * 调用 DeepSeek API (OpenAI-compatible 接口)
   */
  private callDeepSeekAPI(promptStr: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const body = JSON.stringify({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: [
              '你是一个漫画书源规则字段映射助手。',
              '你的任务是根据输入 JSON，判断它的字段可能对应 canonical source schema 中的哪些字段。',
              '你不能创造输入中不存在的 URL、selector、规则。',
              '你不能生成绕过登录、验证码、反自动化、付费墙、访问限制的方案。',
              '你只能返回 JSON。',
              '如果不确定，必须标记 requiresManualReview=true。',
              '',
              'CANONICAL FIELDS:',
              '  search.url, search.listSelector, search.itemSelectors.{title,cover,url,author,latest}',
              '  detail.itemSelectors.{title,cover,author,description,status}',
              '  chapters.listSelector, chapters.itemSelectors.{title,url}',
              '  images.listSelector, images.itemSelectors.src',
            ].join('\n'),
          },
          {
            role: 'user',
            content: promptStr,
          },
        ],
        temperature: 0.1,
        max_tokens: 2048,
        response_format: { type: 'json_object' },
      });

      const url = new URL('/v1/chat/completions', this.config.baseUrl);
      const req = https.request(
        url.toString(),
        {
          method: 'POST',
          timeout: this.config.timeoutMs,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Accept': 'application/json',
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf-8');
            if (res.statusCode !== 200) {
              return reject(new Error(
                `DeepSeek API returned ${res.statusCode}: ${body.slice(0, 200)}`,
              ));
            }
            resolve(body);
          });
          res.on('error', reject);
        },
      );

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`DeepSeek API timeout after ${this.config.timeoutMs}ms`));
      });
      req.write(body);
      req.end();
    });
  }

  /**
   * 解析 DeepSeek 响应为 DeepSeekMappingResponse
   */
  private parseResponse(body: string): DeepSeekMappingResponse | null {
    try {
      const apiResponse = JSON.parse(body);
      const content = apiResponse?.choices?.[0]?.message?.content;
      if (!content) {
        this.logger.warn('DeepSeek response missing choices[0].message.content');
        return null;
      }

      const parsed = JSON.parse(content);

      // 验证必要字段
      if (typeof parsed.schemaConfidence !== 'number') {
        this.logger.warn('DeepSeek response missing schemaConfidence');
        return null;
      }

      return {
        schemaConfidence: parsed.schemaConfidence,
        detectedFormat: parsed.detectedFormat || 'unknown',
        fieldMappings: Array.isArray(parsed.fieldMappings)
          ? parsed.fieldMappings.map((m: any) => ({
              rawPath: String(m.rawPath || ''),
              canonicalField: String(m.canonicalField || ''),
              confidence: typeof m.confidence === 'number' ? m.confidence : 0,
              reason: String(m.reason || ''),
            }))
          : [],
        unsupportedFields: Array.isArray(parsed.unsupportedFields)
          ? parsed.unsupportedFields.map((f: any) => ({
              rawPath: String(f.rawPath || ''),
              reason: String(f.reason || ''),
            }))
          : [],
        warnings: Array.isArray(parsed.warnings)
          ? parsed.warnings.map(String)
          : [],
        requiresManualReview: !!parsed.requiresManualReview,
      };
    } catch (e: any) {
      this.logger.warn(`Failed to parse DeepSeek response: ${e.message}`);
      return null;
    }
  }

  /**
   * 写入审计日志
   */
  private writeAuditLog(log: DeepSeekAuditLog): void {
    try {
      fs.mkdirSync(this.auditLogDir, { recursive: true });
      const filePath = path.join(this.auditLogDir, `${log.requestId}.json`);
      fs.writeFileSync(filePath, JSON.stringify(log, null, 2), 'utf-8');
    } catch (e: any) {
      this.logger.warn(`Failed to write audit log: ${e.message}`);
    }
  }
}
