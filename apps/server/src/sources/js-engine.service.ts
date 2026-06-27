// ============================================================
// apps/server/src/sources/js-engine.service.ts
// QuickJS JS Engine — sandboxed script execution for sources
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';

let loadQuickJsFn: any = null;
let wasmVariant: any = null;

export interface JsRulesConfig {
  engine: 'quickjs';
  script?: string;
  scriptFile?: string;
  timeoutMs?: number;
  memoryLimitMb?: number;
  allowedHosts?: string[];
}

export interface JsExecutionContext {
  sourceId: string;
  sourceName: string;
  sourceHost: string;
}

export class JsExecutionError extends Error {
  constructor(
    public readonly sourceId: string,
    public readonly functionName: string,
    public readonly errorType: 'timeout' | 'oom' | 'runtime' | 'syntax',
    message: string,
  ) {
    super(`[${sourceId}/${functionName}] ${errorType}: ${message}`);
    this.name = 'JsExecutionError';
  }
}

@Injectable()
export class JsEngineService {
  private readonly logger = new Logger(JsEngineService.name);
  private cryptoJsBundle: string = '';
  private initialized = false;

  constructor() {
    this.loadCryptoJsBundle();
  }

  private loadCryptoJsBundle(): void {
    try {
      const raw = readFileSync(
        join(process.cwd(), 'data', 'scripts', 'vendor', 'crypto-js.min.js'),
        'utf-8',
      );
      this.cryptoJsBundle = raw.replace('}(this,', '}(globalThis,');
    } catch (e: any) {
      this.logger.warn('CryptoJS bundle not found, AES decrypt unavailable');
      this.cryptoJsBundle = '';
    }
  }

  private async ensureInit(): Promise<void> {
    if (this.initialized) return;
    const { loadQuickJs } = await import('@sebastianwessel/quickjs');
    const variant = await import('@jitl/quickjs-ng-wasmfile-release-sync');
    loadQuickJsFn = loadQuickJs;
    wasmVariant = variant.default || variant;
    this.initialized = true;
    this.logger.log('QuickJS engine initialized (sandboxed WASM)');
  }

  /**
   * Execute a named JS function in a fresh sandboxed QuickJS runtime.
   * The script must define a global function matching `functionName`.
   * The function receives `args` as a JSON object and must return a value.
   */
  async executeScript<T = any>(
    context: JsExecutionContext,
    functionName: string,
    args: Record<string, any>,
    rules: JsRulesConfig,
  ): Promise<T> {
    await this.ensureInit();

    const timeout = rules.timeoutMs ?? 5000;
    const memoryLimit = Math.min(rules.memoryLimitMb ?? 16, 64);
    const scriptCode = await this.resolveScript(rules);
    const fullCode = this.buildCode(scriptCode, functionName, args);
    const qjs = await loadQuickJsFn(wasmVariant);

    try {
      const result = await qjs.runSandboxed(
        async ({ evalCode }: any) => evalCode(fullCode),
        { timeoutMs: timeout, memoryLimitMb: memoryLimit, allowFetch: true, allowFs: false },
      );

      if (result.ok && result.data !== undefined) {
        try { return JSON.parse(result.data) as T; } catch { return result.data as unknown as T; }
      }

      if (!result.ok) {
        const err = result.error || {};
        if (err.message?.includes('interrupt') || err.message?.includes('timeout'))
          throw new JsExecutionError(context.sourceId, functionName, 'timeout', `Timeout after ${timeout}ms`);
        if (err.message?.includes('memory'))
          throw new JsExecutionError(context.sourceId, functionName, 'oom', `OOM (${memoryLimit}MB limit)`);
        if (err.isSyntaxError)
          throw new JsExecutionError(context.sourceId, functionName, 'syntax', err.message || 'Syntax error');
        throw new JsExecutionError(context.sourceId, functionName, 'runtime', err.message || 'Unknown');
      }
      throw new JsExecutionError(context.sourceId, functionName, 'runtime', 'No result');
    } catch (e: any) {
      if (e instanceof JsExecutionError) throw e;
      throw new JsExecutionError(context.sourceId, functionName, 'runtime', e.message);
    } finally {
      try { qjs.module?.dispose?.(); } catch {}
    }
  }

  /**
   * Decrypt an image buffer using JS `decryptImage` function.
   * Script must define: function decryptImage(args) → { data: "<base64>" }
   */
  async decryptImage(
    context: JsExecutionContext,
    rules: JsRulesConfig,
    buffer: Buffer,
    extraArgs: Record<string, any> = {},
  ): Promise<Buffer> {
    const base64Input = buffer.toString('base64');
    const result = await this.executeScript<{ data: string }>(
      context, 'decryptImage',
      { base64Data: base64Input, ...extraArgs },
      { ...rules, timeoutMs: rules.timeoutMs ?? 3000 },
    );
    return Buffer.from(result.data, 'base64');
  }

  private async resolveScript(rules: JsRulesConfig): Promise<string> {
    if (rules.script) return rules.script;
    if (rules.scriptFile) {
      return readFileSync(join(process.cwd(), 'data', 'scripts', rules.scriptFile), 'utf-8');
    }
    throw new Error('jsRules must have script or scriptFile');
  }

  private buildCode(scriptCode: string, functionName: string, args: Record<string, any>): string {
    const parts: string[] = [];

    // btoa/atob polyfill (QuickJS-ng may not have them)
    parts.push(`
if(typeof btoa==='undefined'){globalThis.btoa=function(s){var c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';var o='';var i=0;for(;i<s.length;i+=3){var a=s.charCodeAt(i)&255,b=i+1<s.length?s.charCodeAt(i+1)&255:NaN,d=i+2<s.length?s.charCodeAt(i+2)&255:NaN;o+=c.charAt(a>>2);o+=c.charAt(((a&3)<<4)|(isNaN(b)?0:(b>>4)));o+=isNaN(b)?'=':c.charAt(((b&15)<<2)|(isNaN(d)?0:(d>>6)));o+=isNaN(d)?'=':c.charAt(d&63);}return o;};}
if(typeof atob==='undefined'){globalThis.atob=function(s){var c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';var o='';var i=0;s=s.replace(/[^A-Za-z0-9+/=]/g,'');for(;i<s.length;i+=4){var a=c.indexOf(s.charAt(i)),b=c.indexOf(s.charAt(i+1)),d=c.indexOf(s.charAt(i+2)),e=c.indexOf(s.charAt(i+3));o+=String.fromCharCode((a<<2)|(b>>4));if(d!==64)o+=String.fromCharCode(((b&15)<<4)|(d>>2));if(e!==64)o+=String.fromCharCode(((d&3)<<6)|e);}return o;};}
`);

    // CryptoJS (if available)
    if (this.cryptoJsBundle) parts.push(this.cryptoJsBundle);

    // User script (defines the target function)
    parts.push(scriptCode);

    // Call the function: pass args as a JSON string (function JSON.parses it)
    const argsJson = JSON.stringify(args);
    parts.push(`JSON.stringify(${functionName}(${argsJson}))`);

    return parts.join('\n');
  }

  // ============================================================
  // Legado Runtime — execute @js: expressions
  // ============================================================

  /** Execute a Legado-style @js: expression with result context + java.put/get */
  async executeLegadoJs(
    context: JsExecutionContext,
    jsCode: string,
    variables: Record<string, any> = {},
    rules?: JsRulesConfig,
  ): Promise<any> {
    await this.ensureInit();

    const fullCode = this.buildLegadoCode(jsCode, variables);
    const timeout = rules?.timeoutMs ?? 5000;
    const mem = Math.min(rules?.memoryLimitMb ?? 16, 64);
    const qjs = await loadQuickJsFn(wasmVariant);

    try {
      const result = await qjs.runSandboxed(
        async ({ evalCode }: any) => evalCode(fullCode),
        { timeoutMs: timeout, memoryLimitMb: mem, allowFetch: true, allowFs: false },
      );
      if (result.ok && result.data !== undefined) {
        try { return JSON.parse(result.data); } catch { return result.data; }
      }
      throw new Error(result.error?.message || 'Legado JS execution failed');
    } finally {
      try { qjs.module?.dispose?.(); } catch {}
    }
  }

  /** Build code for Legado @js: execution with java API + result context */
  private buildLegadoCode(jsCode: string, vars: Record<string, any>): string {
    const parts: string[] = [];

    // btoa/atob polyfill
    parts.push(`
if(typeof btoa==='undefined'){globalThis.btoa=function(s){var c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';var o='';var i=0;for(;i<s.length;i+=3){var a=s.charCodeAt(i)&255,b=i+1<s.length?s.charCodeAt(i+1)&255:NaN,d=i+2<s.length?s.charCodeAt(i+2)&255:NaN;o+=c.charAt(a>>2);o+=c.charAt(((a&3)<<4)|(isNaN(b)?0:(b>>4)));o+=isNaN(b)?'=':c.charAt(((b&15)<<2)|(isNaN(d)?0:(d>>6)));o+=isNaN(d)?'=':c.charAt(d&63);}return o;};}
if(typeof atob==='undefined'){globalThis.atob=function(s){var c='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';var o='';var i=0;s=s.replace(/[^A-Za-z0-9+/=]/g,'');for(;i<s.length;i+=4){var a=c.indexOf(s.charAt(i)),b=c.indexOf(s.charAt(i+1)),d=c.indexOf(s.charAt(i+2)),e=c.indexOf(s.charAt(i+3));o+=String.fromCharCode((a<<2)|(b>>4));if(d!==64)o+=String.fromCharCode(((b&15)<<4)|(d>>2));if(e!==64)o+=String.fromCharCode(((d&3)<<6)|e);}return o;};}
`);

    // CryptoJS
    if (this.cryptoJsBundle) parts.push(this.cryptoJsBundle);

    // Legado runtime: java.put/get + result context
    const varsJson = JSON.stringify(vars);
    parts.push(`
var java_store = {};
var java = {
  put: function(k, v) { java_store[k] = v; },
  get: function(k) { return java_store[k] || ''; },
  getStr: function(k) { return String(java_store[k] || ''); }
};
var __vars = ${varsJson};
for (var k in __vars) { globalThis[k] = __vars[k]; }
var result = __vars.result || '';
`);

    // User's JS expression
    parts.push(jsCode);

    // Return both result and java_store
    parts.push('JSON.stringify({result: result, java_store: java_store})');

    return parts.join('\n');
  }
}
