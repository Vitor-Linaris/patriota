import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { CommentsService } from './comments.service';
import { RequirePermissions } from '../auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';
import {
  CurrentReader,
  OptionalReaderAuth,
  ReaderAuth,
} from '../reader-auth/reader-auth.decorators';
import type { ReaderPrincipal } from '../reader-auth/reader-auth.guard';
import {
  BulkModerateDto,
  CreateCommentDto,
  ListCommentsQueryDto,
  ListMyCommentsQueryDto,
  ModerateCommentDto,
  ModerationQueryDto,
  UpdateCommentDto,
} from './dto/comment.dto';

@Controller()
export class CommentsController {
  constructor(private readonly comments: CommentsService) {}

  // ── Public ────────────────────────────────────────────────────────
  //
  // Optional auth, not required auth: anonymous visitors must see the
  // thread, and a stale 30-day cookie must not break the article page.
  // The only thing the session changes here is that a reader sees their
  // own still-PENDENTE comment, so posting does not look like it failed.
  @OptionalReaderAuth()
  @Get('public/articles/:slug/comments')
  list(
    @Param('slug') slug: string,
    @Query() query: ListCommentsQueryDto,
    @CurrentReader() reader?: ReaderPrincipal,
  ) {
    return this.comments.listForArticle(slug, query, reader?.id);
  }

  /**
   * Posting requires a session — free or paying, both are fine, but never
   * anonymous. 3/minute: enough for a real conversation, useless for a
   * flood. Depends on the trust-proxy fix from M0 to bucket per client.
   */
  @ReaderAuth()
  @Post('public/articles/:slug/comments')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  create(
    @Param('slug') slug: string,
    @Body() dto: CreateCommentDto,
    @CurrentReader() reader: ReaderPrincipal,
    @Req() req: Request,
  ) {
    return this.comments.create(slug, reader, dto, req.ip);
  }

  @ReaderAuth()
  @Patch('public/comments/:id')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCommentDto,
    @CurrentReader() reader: ReaderPrincipal,
  ) {
    return this.comments.update(id, reader.id, dto.body);
  }

  @ReaderAuth()
  @Delete('public/comments/:id')
  remove(@Param('id') id: string, @CurrentReader() reader: ReaderPrincipal) {
    return this.comments.remove(id, reader.id);
  }

  @ReaderAuth()
  @Post('public/comments/:id/report')
  @Throttle({ default: { ttl: 86_400_000, limit: 10 } })
  @HttpCode(HttpStatus.OK)
  report(@Param('id') id: string, @CurrentReader() reader: ReaderPrincipal) {
    return this.comments.report(id, reader.id);
  }

  // ── Reader dashboard ──────────────────────────────────────────────
  //
  // "Em que notícias comentei nas últimas semanas."
  @ReaderAuth()
  @Get('reader/comments')
  mine(
    @CurrentReader() reader: ReaderPrincipal,
    @Query() query: ListMyCommentsQueryDto,
  ) {
    return this.comments.listForReader(reader.id, query);
  }

  // ── Admin moderation ──────────────────────────────────────────────
  //
  // Guarded by the global JwtAuthGuard + RolesGuard, using the
  // comentarios.* permissions that already existed in rbac.constants.ts.
  // Deliberately NOT behind ReaderFeatureGuard: if the newsroom turns the
  // reader area off, they must still be able to clear the queue.
  //
  // Static path before ':id' routes — same ordering rule as
  // articles.controller.ts.
  @Get('admin/comments/stats')
  @RequirePermissions('comentarios.ver')
  stats() {
    return this.comments.stats();
  }

  @Get('admin/comments')
  @RequirePermissions('comentarios.ver')
  moderationList(@Query() query: ModerationQueryDto) {
    return this.comments.listForModeration(query);
  }

  @Post('admin/comments/bulk')
  @RequirePermissions('comentarios.aprovar')
  bulk(@Body() dto: BulkModerateDto, @CurrentUser() user: AuthUser) {
    return this.comments.bulkModerate(dto.ids, dto.status, user);
  }

  @Post('admin/comments/:id/approve')
  @RequirePermissions('comentarios.aprovar')
  @HttpCode(HttpStatus.OK)
  approve(
    @Param('id') id: string,
    @Body() dto: ModerateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.comments.moderate(id, 'APROVADO', user, dto.note);
  }

  @Post('admin/comments/:id/reject')
  @RequirePermissions('comentarios.aprovar')
  @HttpCode(HttpStatus.OK)
  reject(
    @Param('id') id: string,
    @Body() dto: ModerateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.comments.moderate(id, 'REJEITADO', user, dto.note);
  }

  @Post('admin/comments/:id/spam')
  @RequirePermissions('comentarios.aprovar')
  @HttpCode(HttpStatus.OK)
  spam(
    @Param('id') id: string,
    @Body() dto: ModerateCommentDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.comments.moderate(id, 'SPAM', user, dto.note);
  }

  @Delete('admin/comments/:id')
  @RequirePermissions('comentarios.eliminar')
  @HttpCode(HttpStatus.OK)
  destroy(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.comments.moderate(id, 'ELIMINADO', user);
  }
}
