import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ArticlesService } from './articles.service';
import { ArticlesController } from './articles.controller';
import { ArticlesScheduler } from './articles.scheduler';
import { CategoriesModule } from '../categories/categories.module';
import { ReaderAuthModule } from '../reader-auth/reader-auth.module';
import { MediaModule } from '../media/media.module';
import { PackageAccessModule } from '../packages/package-access.module';

@Module({
  // CategoriesModule for CategoryTreeService (the funnel), and
  // ReaderAuthModule for OptionalReaderAuthGuard, which the article page
  // uses to tell a subscriber from everybody else. Neither imports this
  // one back, so there is no cycle to break.
  imports: [
    ScheduleModule.forRoot(),
    CategoriesModule,
    ReaderAuthModule,
    // Publishing an article publishes the images it uses. MediaModule
    // imports nothing back, so there is no cycle.
    MediaModule,
    // The pacote read gate: "did this reader buy this article?". Only the
    // ACCESS half of pacotes, on purpose — the full PackagesModule needs
    // ArticlesService back (publishing a pacote publishes its drafts), so
    // importing that here would be a cycle. See PackageAccessModule.
    PackageAccessModule,
  ],
  providers: [ArticlesService, ArticlesScheduler],
  controllers: [ArticlesController],
  exports: [ArticlesService],
})
export class ArticlesModule {}
