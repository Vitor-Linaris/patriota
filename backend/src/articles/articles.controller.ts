import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ArticlesService } from './articles.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { ListArticlesQueryDto } from './dto/list-articles.query.dto';
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
  @Get('public/homepage')
  homepage() {
    return this.service.getHomepageBundle();
  }
}
