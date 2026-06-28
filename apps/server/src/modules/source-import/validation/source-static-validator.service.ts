// ============================================================
// SourceStaticValidator — 纯静态规则校验
//
// 不发送任何网络请求。只基于规则文本自身做安全检查。
//
// 原则:
//   - 不实现绕过登录、验证码、付费墙、访问控制、反自动化限制的逻辑
//   - 检测到上述限制 → 标记 MANUAL_REVIEW
//   - selector/JSONPath 为空 → warning (不阻断，因为可能 client-mode)
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type { StaticLintDetail, SourceLifecycleStatus } from '../types';
import type { MangaSource } from '../../../sources/source-store';
import { URL } from 'url';

interface LintCheck { name: string; passed: boolean; message?: string }

// ============================================================
// 黑名单
// ============================================================

/** 禁止的 hostname 模式 */
const BLOCKED_HOSTS = [
  /^localhost$/i,
  /^127\.\d+\.\d+\.\d+$/,
  /^0\.0\.0\.0$/,
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,           // link-local
  /metadata\.google\.internal/i,
  /^metadata$/i,
  /^\[::1\]$/i,                      // IPv6 loopback
  /^fc00:/i, /^fd00:/i,             // IPv6 unique local
  /^fe80:/i,                         // IPv6 link-local
];

/** 危险 URL scheme */
const DANGEROUS_SCHEMES = ['javascript:', 'data:', 'file:', 'vbscript:', 'about:', 'blob:', 'chrome:', 'edge:'];

/** 开放代理特征 — URL 中包含 user:pass@ 或其他代理特征 */
const PROXY_PATTERNS = [
  /\/\/[^@]+@/,             // http://user:pass@host
  /@proxy/i,                // proxy in URL
  /@gateway/i,              // gateway patterns
  /\.socks\./i,             // SOCKS proxy
  /\.tor\./i,               // TOR exit node
  /\.i2p\./i,               // I2P
];

/** 登录/验证码/付费墙/反自动化 特征 (结构化检测) */
const AUTH_FIELDS = [
  'loginUrl', 'loginCheck', 'loginAPI', 'loginToken',
  'signUrl', 'signCheck', 'captchaUrl', 'captchaToken',
  'payUrl', 'payCheck', 'vipUrl', 'vipCheck',
  'csrfToken', 'csrfParam', 'dynamicSign',
];
const AUTH_HEADER_PATTERNS = [
  /cookie/i, /authorization/i, /bearer/i, /x-csrf/i,
  /x-xsrf/i, /sign=/i, /timestamp=/i, /nonce=/i,
];

@Injectable()
export class SourceStaticLintService {
  private readonly logger = new Logger(SourceStaticLintService.name);

  /**
   * 静态校验书源规则。
   *
   * @returns { passed, detail } — passed=false 则源不应继续验证
   */
  lint(source: MangaSource): { passed: boolean; detail: StaticLintDetail } {
    const checks: LintCheck[] = [];
    const warnings: string[] = [];

    // ====== 1. ID ======
    const idOk = !!source.id && source.id.length > 0;
    checks.push(item('ID present', idOk, 'Source ID is missing'));
    if (idOk) {
      const idValid = /^[a-zA-Z0-9_-]+$/.test(source.id);
      checks.push(item('ID format (alphanumeric + hyphens + underscores)', idValid, `Invalid ID: "${source.id}"`));
    }

    // ====== 2. Name ======
    const nameOk = !!source.name && source.name.length > 0;
    checks.push(item('Name present', nameOk, 'Source name is missing'));

    // ====== 3-9. Host/URL validation ======
    this.validateHost(source, checks, warnings);

    // ====== 10. Dangerous schemes in selectors ======
    const sourceStr = JSON.stringify(source);
    for (const scheme of DANGEROUS_SCHEMES) {
      if (sourceStr.includes(scheme)) {
        checks.push(item('No dangerous URL schemes', false, `Contains dangerous scheme: ${scheme}`));
      }
    }

    // ====== 11. Open proxy detection ======
    for (const pattern of PROXY_PATTERNS) {
      if (pattern.test(sourceStr) || pattern.test(source.host || '')) {
        checks.push(item('No open proxy URLs', false, `URL contains proxy credentials or pattern: ${pattern}`));
      }
    }

    // ====== 12. Selector / JSONPath emptiness ======
    this.validateSelectors(source, checks, warnings);

    // ====== 13. Login / Captcha / Paywall / Dynamic sign ======
    this.detectAuthRequirements(source, warnings);

    // ====== 14. JS engine dependency ======
    if ((source as any).jsRules || sourceStr.includes('@js:') || sourceStr.includes('<js>')) {
      warnings.push('Contains @js: expressions — requires QuickJS runtime');
    }

    // ====== Size check ======
    const size = Buffer.byteLength(sourceStr, 'utf-8');
    if (size > 500_000) {
      checks.push(item('Definition size ≤ 500KB', false, `Size ${size} bytes exceeds limit`));
    }

    const passed = checks.every(c => c.passed);
    return { passed, detail: { checks, warnings } };
  }

  // ============================================================
  // Host validation (requirements 3-9)
  // ============================================================

  private validateHost(source: MangaSource, checks: LintCheck[], warnings: string[]): void {
    // baseUrl / homepage / searchUrl
    const host = source.host;
    const hasHost = !!host && host.length > 0;
    checks.push(item('Host URL present', hasHost, 'Base URL is missing — source cannot function'));

    if (!hasHost) return;

    let url: URL;
    try {
      url = new URL(host.startsWith('http') ? host : `https://${host}`);
    } catch {
      checks.push(item('Host URL is valid', false, `Cannot parse host URL: "${host}"`));
      return;
    }

    // Protocol: http / https only
    const protocolOk = ['http:', 'https:'].includes(url.protocol);
    checks.push(item('Protocol is http or https', protocolOk, `Invalid protocol: ${url.protocol}`));

    // Hostname blacklist
    const hostname = url.hostname;
    const blocked = BLOCKED_HOSTS.find(p => p.test(hostname));
    checks.push(
      item('Hostname not blocked (localhost/private/metadata)', !blocked,
        blocked ? `Blocked hostname: ${hostname} (matched ${blocked})` : undefined),
    );

    // IP address detection
    if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      warnings.push(`Host is an IP address (${hostname}) — may be unstable or short-lived`);
    }

    // Domain validity (non-IP)
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
      const hasDot = hostname.includes('.') && hostname.split('.').length >= 2;
      checks.push(item('Hostname has valid domain structure', hasDot, 'Hostname does not appear to be a valid domain'));
    }

    // homepage / baseUrl
    const homepage = (source as any).homepage || (source as any).baseUrl;
    if (homepage) {
      try { new URL(homepage.startsWith('http') ? homepage : `https://${homepage}`); }
      catch { warnings.push(`Invalid homepage/baseUrl: "${homepage}"`); }
    }

    // searchUrl
    const searchUrl = source.search?.url;
    if (searchUrl && searchUrl.startsWith('http')) {
      try {
        const su = new URL(searchUrl);
        const suBlocked = BLOCKED_HOSTS.find(p => p.test(su.hostname));
        if (suBlocked) {
          checks.push(item('Search URL hostname not blocked', false, `Search URL hostname blocked: ${su.hostname}`));
        }
      } catch { warnings.push(`Invalid search URL: "${searchUrl}"`); }
    }
  }

  // ============================================================
  // Selector validation (requirement 12)
  // ============================================================

  private validateSelectors(source: MangaSource, _checks: LintCheck[], warnings: string[]): void {
    // Search
    if (!source.search) {
      warnings.push('Missing search rules — source cannot search');
    } else {
      if (!source.search.listSelector || source.search.listSelector.trim() === '') {
        warnings.push('Search listSelector is empty — cannot extract search results');
      }
      if (this.isSuspiciousSelector(source.search.listSelector)) {
        warnings.push(`Suspicious search listSelector: "${source.search.listSelector?.slice(0, 80)}"`);
      }
    }

    // Detail
    if (!source.detail) {
      warnings.push('Missing detail rules');
    } else if (!source.detail.titleSelector) {
      warnings.push('Detail titleSelector is empty — cannot extract comic title');
    }

    // Chapters
    if (!source.chapters) {
      warnings.push('Missing chapters rules — cannot list chapters');
    } else {
      if (!source.chapters.listSelector || source.chapters.listSelector.trim() === '') {
        warnings.push('Chapters listSelector is empty — cannot extract chapter list');
      }
    }

    // Images
    if (!source.images) {
      warnings.push('Missing images rules — cannot extract images');
    } else {
      if (!source.images.listSelector || source.images.listSelector.trim() === '') {
        warnings.push('Images listSelector is empty — cannot extract image URLs');
      }
    }
  }

  // ============================================================
  // Auth detection (requirement 13)
  // ============================================================

  private detectAuthRequirements(source: MangaSource, warnings: string[]): void {
    const raw = source as any;
    const authTags: string[] = [];

    // Structured fields
    for (const field of AUTH_FIELDS) {
      if (raw[field] && (typeof raw[field] === 'string' || typeof raw[field] === 'object')) {
        authTags.push(field);
      }
    }

    // Boolean flags
    if (raw.needLogin === true || raw.requireLogin === true) authTags.push('needLogin=true');
    if (raw.needCaptcha === true) authTags.push('needCaptcha=true');
    if (raw.needPay === true || raw.needVip === true) authTags.push('needPay/needVip=true');

    // Headers containing auth/sign patterns
    const headers = typeof raw.headers === 'string' ? raw.headers : JSON.stringify(raw.headers || {});
    for (const pat of AUTH_HEADER_PATTERNS) {
      if (pat.test(headers)) {
        authTags.push(`headers match: ${pat}`);
        break;
      }
    }

    // Login hints in selectors (specific patterns, not generic substring)
    const str = JSON.stringify(source).toLowerCase();
    if (str.includes('"login"') || str.includes('"登录"')) authTags.push('"login" field');
    if (str.includes('"captcha"') || str.includes('"验证码"')) authTags.push('"captcha" field');
    if (str.includes('"pay"') || str.includes('"vip"') || str.includes('"付费"')) authTags.push('"pay/vip" field');

    if (authTags.length > 0) {
      warnings.push(`⚠ MANUAL_REVIEW: Authentication/captcha/paywall/dynamic-sign detected (${authTags.join(', ')}). Source requires manual review — automated bypass is NOT implemented.`);
    }
  }

  // ============================================================
  // Helpers
  // ============================================================

  private isSuspiciousSelector(sel: string | undefined): boolean {
    if (!sel) return false;
    const d = ['<script', 'eval(', 'Function(', 'setTimeout(', 'setInterval(',
               'require(', 'process.', '__dirname', '__filename'];
    return d.some(x => sel.includes(x));
  }
}

function item(name: string, passed: boolean, message?: string): LintCheck {
  return { name, passed, message };
}
