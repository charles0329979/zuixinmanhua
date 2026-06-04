import { Module } from '@nestjs/common';
import { SourcesService } from './sources.service';
import { SourcesController } from './sources.controller';
import { SourceConfigService } from './config/source-config.service';
import { DomainResolverService } from './config/domain-resolver.service';
import { AdapterFactoryService } from './adapter-factory.service';
import { CircuitBreakerService } from './circuit-breaker.service';

@Module({
  providers: [
    SourceConfigService,
    DomainResolverService,
    AdapterFactoryService,
    CircuitBreakerService,
    SourcesService,
  ],
  controllers: [SourcesController],
  exports: [
    SourcesService,
    SourceConfigService,
    DomainResolverService,
    AdapterFactoryService,
    CircuitBreakerService,
  ],
})
export class SourcesModule {}
