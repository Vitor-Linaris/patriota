import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateSubtopicDto } from './dto/subtopic.dto';
import { ReorderCategoryDto } from './dto/reorder-category.dto';
import { RequirePermissions } from '../auth/permissions.decorator';
import { Public } from '../auth/public.decorator';

@Controller()
export class CategoriesController {
  constructor(private readonly service: CategoriesService) {}

  // ── Admin ─────────────────────────────────────────────────────────
  @Get('admin/categories')
  @RequirePermissions('categorias.ver')
  list() {
    return this.service.listAdmin();
  }

  // Declared before any 'admin/categories/:id' route so 'tree' is never
  // swallowed as an id.
  @Get('admin/categories/tree')
  @RequirePermissions('categorias.ver')
  tree() {
    return this.service.listTree();
  }

  /**
   * The sections an article can be filed under — for the picker in the
   * article editor, NOT for managing the catalogue.
   *
   * Gated on `artigos.ler`, not `categorias.ver`, and that distinction
   * is the whole reason this route exists. Filing an article under a
   * section is part of writing it; seeing and editing the catalogue is
   * a separate job. A newsroom that takes `categorias.ver` off a
   * journalist — a reasonable thing to want, it hides a screen they
   * have no business in — used to leave them unable to create an
   * article at all: the editor's list came back 403, arrived empty, and
   * the page told them to go create a section first, which they also
   * could not do.
   *
   * Deliberately a leaner payload than /tree: id, name, slug, colour and
   * depth, no article counts or visibility flags. Someone without
   * `categorias.ver` should be able to FILE, not to inspect the
   * catalogue through a side door.
   */
  @Get('admin/categories/options')
  @RequirePermissions('artigos.ler')
  options() {
    return this.service.listPickerOptions();
  }

  // POST rather than PATCH: a PATCH on this path would be caught by
  // 'admin/categories/:id' with id = "reorder", surfacing as a confusing
  // 404 from Prisma instead of hitting this handler at all.
  @Post('admin/categories/reorder')
  @RequirePermissions('categorias.editar')
  reorder(@Body() dto: ReorderCategoryDto) {
    return this.service.reorder(dto);
  }

  @Post('admin/categories')
  @RequirePermissions('categorias.criar')
  create(@Body() dto: CreateCategoryDto) {
    return this.service.create(dto);
  }

  @Patch('admin/categories/:id')
  @RequirePermissions('categorias.editar')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.service.update(id, dto);
  }

  @Delete('admin/categories/:id')
  @RequirePermissions('categorias.eliminar')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Post('admin/categories/:id/subtopics')
  @RequirePermissions('categorias.editar')
  addSubtopic(@Param('id') id: string, @Body() dto: CreateSubtopicDto) {
    return this.service.addSubtopic(id, dto);
  }

  @Delete('admin/categories/:id/subtopics/:subId')
  @RequirePermissions('categorias.editar')
  removeSubtopic(@Param('subId') subId: string) {
    return this.service.removeSubtopic(subId);
  }

  // ── Public ────────────────────────────────────────────────────────
  @Public()
  @Get('public/categories')
  publicList() {
    return this.service.listPublic();
  }

  /**
   * The whole visible tree, nested. Separate from /public/categories
   * (which stays a flat list of roots) so existing consumers — the
   * search filter among them — don't suddenly receive hundreds of
   * deep nodes they have no way to render.
   *
   * Declared before ':slug' so "tree" isn't read as a category slug.
   */
  @Public()
  @Get('public/categories/tree')
  publicTree() {
    return this.service.listPublicTree();
  }

  @Public()
  @Get('public/categories/:slug')
  publicBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }
}
