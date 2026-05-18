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

  @Public()
  @Get('public/categories/:slug')
  publicBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }
}
