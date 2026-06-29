// ============================================================
// apps/server/src/ota/ota.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { OtaController } from './ota.controller';
import { SourcePlatformModule } from '../source-platform/source-platform.module';

@Module({
  imports: [SourcePlatformModule],
  controllers: [OtaController],
})
export class OtaModule {}
