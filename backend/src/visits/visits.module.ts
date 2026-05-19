import { Module } from '@nestjs/common';
import { RedisModule } from '../redis/redis.module';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

@Module({
  imports: [RedisModule],
  controllers: [VisitsController],
  providers: [VisitsService],
  exports: [VisitsService],
})
export class VisitsModule {}
