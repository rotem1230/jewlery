import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { EventLogService } from './event-log.service';

@Global()
@Module({
  providers: [AuditService, EventLogService],
  exports: [AuditService, EventLogService],
})
export class AuditModule {}
