// ============================================================
// packages/types/src/source-origin.ts
// SourceImportProvider, SourceOrigin, SourceCapabilities, SourceLifecycleStatus
// ============================================================

/**
 * 书源导入来源提供者类型
 */
export type SourceImportProvider =
  | 'pipimiao'
  | 'github'
  | 'manual'
  | 'legado'
  | 'comicfs';

/**
 * 书源来源追溯 — 记录书源的出处信息，支持审计和回滚
 */
export interface SourceOrigin {
  /** 来源提供者 */
  provider: SourceImportProvider;
  /** 仓库 URL */
  repositoryUrl?: string;
  /** Git 分支 */
  branch?: string;
  /** 导入时的 commit SHA */
  commitSha?: string;
  /** 原始文件在仓库中的路径 */
  filePath?: string;
  /** 导入时间 (ISO 8601) */
  importedAt: string;
  /** 原始文件的 SHA256 hash */
  rawHash: string;
}

/**
 * 书源能力标记 — 描述书源四个阶段的支持情况
 */
export interface SourceCapabilities {
  /** 搜索功能是否可用 */
  search: boolean;
  /** 详情页解析是否可用 */
  detail: boolean;
  /** 章节列表解析是否可用 */
  chapters: boolean;
  /** 图片提取是否可用 */
  images: boolean;
  /** 是否需要 JavaScript 引擎（QuickJS 沙箱） */
  requiresJs: boolean;
  /** 是否需要登录 */
  requiresLogin: boolean;
  /** 是否需要手写 TypeScript Adapter（无法用规则描述） */
  requiresManualAdapter: boolean;
}

/**
 * 书源生命周期状态机
 *
 * 合法状态转换:
 *   DISCOVERED      → PARSED | UNSUPPORTED
 *   PARSED          → CANDIDATE | MANUAL_REVIEW
 *   CANDIDATE       → VALIDATING
 *   VALIDATING      → VERIFIED | QUARANTINED | MANUAL_REVIEW | STATIC_REJECTED
 *   VERIFIED        → PROMOTED | QUARANTINED | DISABLED
 *   PROMOTED        → DISABLED | QUARANTINED
 *   QUARANTINED     → CANDIDATE (重试) | MANUAL_REVIEW | DISABLED
 *   MANUAL_REVIEW   → CANDIDATE | UNSUPPORTED | DISABLED
 *   STATIC_REJECTED → DISABLED
 *   UNSUPPORTED     → DISABLED
 *   DISABLED        → (终态)
 */
export type SourceLifecycleStatus =
  | 'DISCOVERED'        // 已发现，尚未解析
  | 'PARSED'            // 已解析/标准化
  | 'UNSUPPORTED'       // 不支持的格式或能力
  | 'STATIC_REJECTED'   // 静态校验未通过
  | 'CANDIDATE'         // 候选，等待验证 (别名: PENDING_VALIDATE)
  | 'PENDING_VALIDATE'  // @deprecated 使用 CANDIDATE
  | 'VALIDATING'        // 验证中
  | 'QUARANTINED'       // 已隔离（验证未通过或临时降级）
  | 'MANUAL_REVIEW'     // 需要人工审核
  | 'VERIFIED'          // 已验证通过
  | 'PROMOTED'          // 已发布到 stable
  | 'DISABLED';         // 已禁用

/**
 * 状态转换合法性表
 */
export const VALID_TRANSITIONS: Record<SourceLifecycleStatus, SourceLifecycleStatus[]> = {
  DISCOVERED:       ['PARSED', 'UNSUPPORTED'],
  PARSED:           ['CANDIDATE', 'PENDING_VALIDATE', 'MANUAL_REVIEW'],
  UNSUPPORTED:      ['DISABLED', 'MANUAL_REVIEW'],
  STATIC_REJECTED:  ['DISABLED', 'MANUAL_REVIEW'],
  CANDIDATE:        ['VALIDATING'],
  PENDING_VALIDATE: ['VALIDATING'],
  VALIDATING:       ['VERIFIED', 'QUARANTINED', 'MANUAL_REVIEW', 'STATIC_REJECTED'],
  QUARANTINED:      ['CANDIDATE', 'PENDING_VALIDATE', 'MANUAL_REVIEW', 'DISABLED'],
  MANUAL_REVIEW:    ['CANDIDATE', 'PENDING_VALIDATE', 'UNSUPPORTED', 'DISABLED', 'VERIFIED'],
  VERIFIED:         ['PROMOTED', 'QUARANTINED', 'DISABLED'],
  PROMOTED:         ['DISABLED', 'QUARANTINED'],
  DISABLED:         [],
};

/**
 * 检查状态转换是否合法
 */
export function isValidTransition(
  from: SourceLifecycleStatus,
  to: SourceLifecycleStatus,
): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * 状态的中文显示名
 */
export const STATUS_LABELS: Record<SourceLifecycleStatus, string> = {
  DISCOVERED:        '已发现',
  PARSED:            '已解析',
  UNSUPPORTED:       '不支持',
  STATIC_REJECTED:   '静态拒绝',
  CANDIDATE:         '候选',
  PENDING_VALIDATE:  '待验证',
  VALIDATING:        '验证中',
  QUARANTINED:       '已隔离',
  MANUAL_REVIEW:     '人工审核',
  VERIFIED:          '已验证',
  PROMOTED:          '已发布',
  DISABLED:          '已禁用',
};
