import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { ArticlesScheduler } from './articles.scheduler';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [ArticlesService, ArticlesScheduler],
  controllers: [ArticlesController],
  exports: [ArticlesService],
})
export class ArticlesModule {}
