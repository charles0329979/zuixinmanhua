// ============================================================
// apps/server/src/ota/ota.module.ts
// ============================================================

import { Module } from '@nestjs/common';
import { OtaController } from './ota.controller';
import { SourcesModule } from '../sources/sources.module';
import { SourceImportModule } from '../modules/source-import/source-import.module';

@Module({
  imports: [SourcesModule, SourceImportModule],
  controllers: [OtaController],
})
export class OtaModule {}
