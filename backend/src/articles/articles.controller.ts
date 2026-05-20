import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { IsOptional, IsString, Length } from 'class-validator';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ListArticlesQueryDto } from './dto/list-articles.query.dto';

class SubmitArticleDto {
  @IsOptional()
  @IsString()
  scheduledAt?: string;
}

class RejectArticleDto {
  @IsOptional()
  @IsString()
  @Length(0, 500)
  reason?: string;
}
import { RequirePermissions } from '../auth/permissions.decorator';
import { Public } from '../auth/public.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.service';

@Controller()
export class ArticlesController {
  constructor(private readonly service: ArticlesService) {}

  // ── Admin ─────────────────────────────────────────────────────────
  @Get('admin/articles')
  @RequirePermissions('artigos.ler')
  list(@Query() query: ListArticlesQueryDto) {
    return this.service.list(query);
  }

  // Counts across the WHOLE corpus, used by the stats row on
  // /admin/artigos so the numbers don't reflect just the current
  // pagination window. Note: placed BEFORE /:id so the static path
  // wins over the dynamic param.
  @Get('admin/articles/stats')
  @RequirePermissions('artigos.ler')
  stats() {
    return this.service.getStats();
  }

  @Get('admin/articles/:id')
  @RequirePermissions('artigos.ler')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post('admin/articles')
  @RequirePermissions('artigos.criar')
  create(@Body() dto: CreateArticleDto, @CurrentUser() user: AuthUser) {
    return this.service.create(dto, { id: user.id, role: user.role });
  }

  @Patch('admin/articles/:id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateArticleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.update(id, dto, { id: user.id, role: user.role });
  }

  @Post('admin/articles/:id/publish')
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.publish(id, { id: user.id, role: user.role });
  }

  @Post('admin/articles/:id/submit')
  @RequirePermissions('artigos.submeter')
  submit(
    @Param('id') id: string,
    @Body() dto: SubmitArticleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.submitForReview(
      id,
      { id: user.id, role: user.role },
      { scheduledAt: dto.scheduledAt ?? null },
    );
  }

  @Post('admin/articles/:id/reject')
  @RequirePermissions('artigos.aprovar')
  reject(
    @Param('id') id: string,
    @Body() dto: RejectArticleDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.service.reject(
      id,
      { id: user.id, role: user.role },
      dto.reason,
    );
  }

  @Post('admin/articles/:id/archive')
  archive(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.archive(id, { id: user.id, role: user.role });
  }

  @Delete('admin/articles/:id')
  @RequirePermissions('artigos.eliminar')
  remove(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.service.remove(id, { id: user.id, role: user.role });
  }

  // ── Public ────────────────────────────────────────────────────────
  @Public()
  @Get('public/articles')
  publicList(@Query() query: ListArticlesQueryDto) {
    return this.service.listPublic(query);
  }

  @Public()
  @Get('public/articles/by-slug/:slug')
  publicBySlug(@Param('slug') slug: string) {
    return this.service.findPublicBySlug(slug);
  }

  @Public()
  @Get('public/articles/related/:slug')
  publicRelated(
    @Param('slug') slug: string,
    @Query('limit', new DefaultValuePipe(4), ParseIntPipe) limit: number,
  ) {
    return this.service.findRelated(slug, limit);
  }

  @Public()
  @Get('public/homepage')
  homepage() {
    return this.service.getHomepageBundle();
  }
}
