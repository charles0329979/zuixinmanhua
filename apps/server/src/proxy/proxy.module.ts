import { Module } from '@nestjs/common';
import { ProxyService } from './proxy.service';
import { ProxyController } from './proxy.controller';
import { SourcesModule } from '../sources/sources.module';
import { SourcePlatformModule } from '../source-platform/source-platform.module';

@Module({
  imports: [SourcesModule, SourcePlatformModule],
  providers: [ProxyService],
  controllers: [ProxyController],
})
export class ProxyModule {}
