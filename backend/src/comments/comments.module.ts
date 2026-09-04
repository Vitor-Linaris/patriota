import { Module } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CommentMailService } from './comment-mail.service';
import { CommentsController } from './comments.controller';
import { ReaderAuthModule } from '../reader-auth/reader-auth.module';
import { ActivityLogModule } from '../activity-log/activity-log.module';

/**
 * Public reader comments plus the newsroom moderation queue, in one
 * module because they are two views of the same rows.
 *
 * The admin routes reuse the comentarios.* permissions that already
 * existed in rbac.constants.ts and were already granted to EDITOR,
 * REVISOR and MODERADOR — nothing to add, nothing to backfill.
 */
@Module({
  imports: [ReaderAuthModule, ActivityLogModule],
  providers: [CommentsService, CommentMailService],
  controllers: [CommentsController],
  exports: [CommentsService],
})
export class CommentsModule {}
