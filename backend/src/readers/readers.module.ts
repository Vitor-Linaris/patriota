import { Module } from '@nestjs/common';
import { ReadersService } from './readers.service';
import { AdminReadersController } from './admin-readers.controller';
import { CommentsModule } from '../comments/comments.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';

/**
 * Newsroom-side administration of readers.
 *
 * Separate from ReaderAuthModule, which is the reader's own view of
 * themselves. This one is the newsroom looking in, and it grows: today
 * suspensions, later the listing and the manual subscription grants.
 *
 * CommentsModule is imported for the optional purge that can accompany a
 * ban — the comment count on each article has to be recomputed, and the
 * one place that knows how is CommentsService.
 */
@Module({
  imports: [CommentsModule, ActivityLogModule],
  providers: [ReadersService],
  controllers: [AdminReadersController],
  exports: [ReadersService],
})
export class ReadersModule {}
