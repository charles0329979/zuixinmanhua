import { Module } from '@nestjs/common';
import { ProxyService } from './proxy.service';
import { ProxyController } from './proxy.controller';
import { SourcesModule } from '../sources/sources.module';

@Module({
  imports: [SourcesModule],
  providers: [ProxyService],
  controllers: [ProxyController],
})
export class ProxyModule {}
