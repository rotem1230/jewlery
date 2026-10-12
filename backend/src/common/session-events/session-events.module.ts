import { Global, Module } from '@nestjs/common';
import { SessionEvents } from './session-events.service';

@Global()
@Module({
  providers: [SessionEvents],
  exports: [SessionEvents],
})
export class SessionEventsModule {}
