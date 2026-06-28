// ============================================================
// apps/server/src/modules/source-import/remote-repository/repository-manifest.service.ts
// 仓库配置管理 — 从环境变量读取、验证仓库配置
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type { RepositoryConfig } from '../types';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 默认仓库配置 — 可通过环境变量 SOURCE_IMPORT_REPOSITORIES 覆盖
 *
 * 格式 (JSON 字符串):
 * SOURCE_IMPORT_REPOSITORIES='[{"id":"pipimiao-main","type":"github","url":"https://github.com/...","branch":"main","enabled":true}]'
 */
const DEFAULT_REPOSITORIES: RepositoryConfig[] = [
  {
    id: 'jiwangyihao-legado-manga',
    type: 'github',
    url: 'https://github.com/jiwangyihao/source-j-legado',
    branch: 'main',
    enabled: true,
    sourcePath: '',
  },
];

@Injectable()
export class RepositoryManifestService {
  private readonly logger = new Logger(RepositoryManifestService.name);
  private repositories: RepositoryConfig[] = [];

  constructor() {
    this.loadRepositories();
  }

  /**
   * 获取所有已配置的仓库
   */
  getRepositories(): RepositoryConfig[] {
    return [...this.repositories];
  }

  /**
   * 获取所有启用的仓库
   */
  getEnabledRepositories(): RepositoryConfig[] {
    return this.repositories.filter(r => r.enabled);
  }

  /**
   * 获取单个仓库配置
   */
  getRepository(id: string): RepositoryConfig | null {
    return this.repositories.find(r => r.id === id) || null;
  }

  /**
   * 启用/禁用仓库
   */
  setEnabled(id: string, enabled: boolean): boolean {
    const repo = this.repositories.find(r => r.id === id);
    if (!repo) return false;
    repo.enabled = enabled;
    return true;
  }

  /**
   * 重新加载仓库配置
   */
  reload(): void {
    this.loadRepositories();
  }

  /** 从环境变量和配置文件加载 */
  private loadRepositories(): void {
    const repos: RepositoryConfig[] = [];

    // 1. 尝试从环境变量加载
    const envRepos = process.env.SOURCE_IMPORT_REPOSITORIES;
    if (envRepos) {
      try {
        const parsed = JSON.parse(envRepos);
        if (Array.isArray(parsed)) {
          for (const r of parsed) {
            if (this.validateRepoConfig(r)) repos.push(r);
          }
          this.logger.log(`Loaded ${repos.length} repositories from SOURCE_IMPORT_REPOSITORIES`);
        }
      } catch (e: any) {
        this.logger.warn(`Failed to parse SOURCE_IMPORT_REPOSITORIES: ${e.message}`);
      }
    }

    // 2. 尝试从配置文件加载
    const configPath = path.join(process.cwd(), 'data', 'source-registry', 'repositories.json');
    if (repos.length === 0 && fs.existsSync(configPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        if (Array.isArray(parsed)) {
          for (const r of parsed) {
            if (this.validateRepoConfig(r)) repos.push(r);
          }
          this.logger.log(`Loaded ${repos.length} repositories from repositories.json`);
        }
      } catch (e: any) {
        this.logger.warn(`Failed to load repositories.json: ${e.message}`);
      }
    }

    // 3. 使用默认配置
    if (repos.length === 0) {
      repos.push(...DEFAULT_REPOSITORIES);
      this.logger.log(`Using ${repos.length} default repositories`);
    }

    this.repositories = repos;
  }

  /** 验证仓库配置 */
  private validateRepoConfig(r: any): r is RepositoryConfig {
    if (!r.id || typeof r.id !== 'string') {
      this.logger.warn(`Invalid repo config: missing or invalid id`);
      return false;
    }
    if (!r.url || typeof r.url !== 'string') {
      this.logger.warn(`Invalid repo config [${r.id}]: missing or invalid url`);
      return false;
    }
    if (r.type !== 'github') {
      this.logger.warn(`Invalid repo config [${r.id}]: unsupported type "${r.type}", only "github" supported`);
      return false;
    }
    // 安全检查: URL 必须是 github.com
    if (!r.url.includes('github.com')) {
      this.logger.warn(`Invalid repo config [${r.id}]: url must be github.com`);
      return false;
    }
    return true;
  }
}
