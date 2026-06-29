// ============================================================
// source-platform/runtime/driver-registry.service.ts
// DriverRegistryService — ISourceDriver 注册表
//
// 职责:
//   1. 持有所有 ISourceDriver 的 Map<id, driver>
//   2. 提供 register / unregister / get / has / list 操作
//   3. 不包含任何执行逻辑 (执行逻辑在 source-runtime.service.ts)
// ============================================================

import { Injectable, Logger } from '@nestjs/common';
import type { ISourceDriver } from './source-driver.interface';
import { DriverNotFoundError } from './source-runtime-error';

@Injectable()
export class DriverRegistryService {
  private readonly logger = new Logger(DriverRegistryService.name);
  private readonly drivers = new Map<string, ISourceDriver>();

  /** 注册一个驱动 */
  register(driver: ISourceDriver): void {
    if (this.drivers.has(driver.sourceId)) {
      this.logger.warn(`Driver ${driver.sourceId} already registered, overwriting`);
    }
    this.drivers.set(driver.sourceId, driver);
    this.logger.log(`Registered: ${driver.sourceId} (${driver.sourceName})`);
  }

  /** 批量注册 */
  registerAll(drivers: ISourceDriver[]): void {
    for (const d of drivers) this.register(d);
  }

  /** 移除注册 */
  unregister(id: string): void {
    const existed = this.drivers.delete(id);
    if (existed) {
      this.logger.log(`Unregistered: ${id}`);
    }
  }

  /** 获取驱动，不存在则抛错 */
  get(id: string): ISourceDriver {
    const driver = this.drivers.get(id);
    if (!driver) {
      throw new DriverNotFoundError(id);
    }
    return driver;
  }

  /** 获取驱动，不存在返回 undefined */
  getOptional(id: string): ISourceDriver | undefined {
    return this.drivers.get(id);
  }

  /** 检查是否存在 */
  has(id: string): boolean {
    return this.drivers.has(id);
  }

  /** 列出所有 */
  listAll(): ISourceDriver[] {
    return [...this.drivers.values()];
  }

  /** 筛选 */
  filter(predicate: (d: ISourceDriver) => boolean): ISourceDriver[] {
    return this.listAll().filter(predicate);
  }

  /** 计数 */
  get count(): number {
    return this.drivers.size;
  }
}
