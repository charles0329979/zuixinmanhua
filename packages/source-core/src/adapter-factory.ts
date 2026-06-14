// ============================================================
// packages/source-core/src/adapter-factory.ts
// 适配器工厂 — 从注册表创建硬编码适配器实例
// ============================================================

import type { ISourceAdapter, AdapterContext } from '@zuixinmanhua/types';
import type { IHttpClient } from '@zuixinmanhua/network';
import { BaseAdapter } from './adapters/base.adapter';
import { BaoziAdapter } from './adapters/baozi';
import { KanmanAdapter } from './adapters/kanman';
import { ManwaAdapter } from './adapters/manwa';
import { YemanAdapter } from './adapters/yeman';
import { CopyAdapter } from './adapters/copy';

// 所有硬编码适配器注册表
const ADAPTER_REGISTRY: Record<
  string,
  new (ctx: AdapterContext, http: IHttpClient) => ISourceAdapter
> = {
  baozi: BaoziAdapter,
  kanman: KanmanAdapter,
  manwa: ManwaAdapter,
  yeman: YemanAdapter,
  copy: CopyAdapter,
};

const ADAPTER_NAMES: Record<string, string> = {
  baozi: '包子漫画',
  kanman: '看漫画',
  manwa: '漫蛙',
  yeman: '野蛮漫画',
  copy: '拷贝漫画',
};

export class AdapterFactory {
  constructor(private httpClient: IHttpClient) {}

  /** 创建硬编码适配器实例 */
  create(
    sourceId: string,
    context: AdapterContext,
  ): ISourceAdapter | null {
    const Ctor = ADAPTER_REGISTRY[sourceId];
    if (!Ctor) return null;
    return new Ctor(context, this.httpClient);
  }

  /** 注册自定义适配器 (插件化扩展点) */
  registerAdapter(
    id: string,
    ctor: new (ctx: AdapterContext, http: IHttpClient) => ISourceAdapter,
  ): void {
    ADAPTER_REGISTRY[id] = ctor;
  }

  /** 获取已注册的适配器 ID 列表 */
  listAdapterIds(): string[] {
    return Object.keys(ADAPTER_REGISTRY);
  }

  /** 获取适配器名称 */
  getAdapterName(id: string): string {
    return ADAPTER_NAMES[id] || id;
  }
}
