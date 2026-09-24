import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { SocialPublishingService } from './social-publishing.service';
import { RequirePermissions } from '../auth/permissions.decorator';

/**
 * The newsroom's view of what is about to be posted, and what was.
 *
 * Gated on `artigos.publicar` rather than a new permission of its own:
 * deciding that a piece goes out to the public and deciding how it is
 * announced are the same editorial act, and whoever may do the first
 * already holds it. A new permission key would mean a migration, a row
 * on /admin/permissoes, and a screen that silently does nothing for
 * everyone until someone remembers to tick it.
 */
@Controller('admin/social')
export class SocialController {
  constructor(private readonly social: SocialPublishingService) {}

  /** The queue and the history for /admin/redes. */
  @Get()
  @RequirePermissions('artigos.publicar')
  list(@Query('limit') limit?: string) {
    return this.social.list(limit ? Number(limit) : undefined);
  }

  /** Whether the tokens actually reach Meta, and the Instagram quota. */
  @Get('estado')
  @RequirePermissions('artigos.publicar')
  status() {
    return this.social.connectionStatus();
  }

  /** The card in the article editor. */
  @Get('artigo/:articleId')
  @RequirePermissions('artigos.publicar')
  forArticle(@Param('articleId') articleId: string) {
    return this.social.forArticle(articleId);
  }

  @Patch(':id')
  @RequirePermissions('artigos.publicar')
  updateMessage(@Param('id') id: string, @Body('message') message: string) {
    return this.social.updateMessage(id, message ?? '');
  }

  @Post(':id/cancelar')
  @RequirePermissions('artigos.publicar')
  cancel(@Param('id') id: string) {
    return this.social.cancel(id);
  }
}
