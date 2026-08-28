import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { ArticlesScheduler } from './articles.scheduler';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  // For CategoryTreeService (the funnel). CategoriesModule does not
  // import this one back, so there is no cycle to break.
  imports: [ScheduleModule.forRoot(), CategoriesModule],
  providers: [ArticlesService, ArticlesScheduler],
  controllers: [ArticlesController],
  exports: [ArticlesService],
})
export class ArticlesModule {}
