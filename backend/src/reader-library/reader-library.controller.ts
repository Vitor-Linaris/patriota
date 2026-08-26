import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ReaderLibraryService } from './reader-library.service';
import { CurrentReader, ReaderAuth } from '../reader-auth/reader-auth.decorators';
import type { ReaderPrincipal } from '../reader-auth/reader-auth.guard';
import {
  ArticleStateQueryDto,
  FollowCategoryDto,
  LibraryPageQueryDto,
  TrackReadDto,
} from './dto/library.dto';

/**
 * Favourites, reading history and the per-article state blob.
 *
 * Class-level @ReaderAuth(): every route needs a reader session and none
 * is reachable with a staff token. PUT rather than POST on the favourite
 * toggles so a double tap is a no-op instead of a unique-constraint error.
 */
@ReaderAuth()
@Controller()
export class ReaderLibraryController {
  constructor(private readonly library: ReaderLibraryService) {}

  // ── categories ──────────────────────────────────────────────────────
  @Get('reader/favorites/categories')
  listCategories(@CurrentReader() reader: ReaderPrincipal) {
    return this.library.listCategoryFavorites(reader.id);
  }

  @Put('reader/favorites/categories/:categoryId')
  follow(
    @CurrentReader() reader: ReaderPrincipal,
    @Param('categoryId') categoryId: string,
    @Body() dto: FollowCategoryDto,
  ) {
    return this.library.followCategory(reader.id, categoryId, dto.notify ?? true);
  }

  @Delete('reader/favorites/categories/:categoryId')
  unfollow(
    @CurrentReader() reader: ReaderPrincipal,
    @Param('categoryId') categoryId: string,
  ) {
    return this.library.unfollowCategory(reader.id, categoryId);
  }

  // ── articles ────────────────────────────────────────────────────────
  @Get('reader/favorites/articles')
  listArticles(
    @CurrentReader() reader: ReaderPrincipal,
    @Query() query: LibraryPageQueryDto,
  ) {
    return this.library.listArticleFavorites(reader.id, query);
  }

  @Put('reader/favorites/articles/:articleId')
  save(
    @CurrentReader() reader: ReaderPrincipal,
    @Param('articleId') articleId: string,
  ) {
    return this.library.saveArticle(reader.id, articleId);
  }

  @Delete('reader/favorites/articles/:articleId')
  unsave(
    @CurrentReader() reader: ReaderPrincipal,
    @Param('articleId') articleId: string,
  ) {
    return this.library.unsaveArticle(reader.id, articleId);
  }

  // ── history ─────────────────────────────────────────────────────────
  @Get('reader/history')
  history(
    @CurrentReader() reader: ReaderPrincipal,
    @Query() query: LibraryPageQueryDto,
  ) {
    return this.library.listHistory(reader.id, query);
  }

  /**
   * Fired once per article view from the client. Generous limit because
   * an active reader legitimately opens many articles in a session, but
   * bounded so it cannot be used to hammer the DB.
   */
  @Post('reader/history')
  @Throttle({ default: { ttl: 60_000, limit: 60 } })
  track(
    @CurrentReader() reader: ReaderPrincipal,
    @Body() dto: TrackReadDto,
  ) {
    return this.library.trackRead(reader.id, dto.articleId, dto.progress);
  }

  @Delete('reader/history')
  clearHistory(@CurrentReader() reader: ReaderPrincipal) {
    return this.library.clearHistory(reader.id);
  }

  // ── per-article state ───────────────────────────────────────────────
  @Get('reader/state')
  state(
    @CurrentReader() reader: ReaderPrincipal,
    @Query() query: ArticleStateQueryDto,
  ) {
    return this.library.articleState(reader.id, query.articleId);
  }
}
