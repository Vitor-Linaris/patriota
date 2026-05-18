import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateSubtopicDto } from './dto/subtopic.dto';

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function isPrismaCode(e: unknown, code: string): boolean {
  return Boolean(
    e && typeof e === 'object' && (e as { code?: string }).code === code,
  );
}

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  listAdmin() {
    return this.prisma.category.findMany({
      orderBy: { order: 'asc' },
      include: {
        subtopics: { orderBy: { order: 'asc' } },
      },
    });
  }

  listPublic() {
    return this.prisma.category.findMany({
      where: { visible: true },
      orderBy: { order: 'asc' },
      include: {
        subtopics: { orderBy: { order: 'asc' } },
      },
    });
  }

  async findBySlug(slug: string) {
    const cat = await this.prisma.category.findUnique({
      where: { slug },
      include: { subtopics: { orderBy: { order: 'asc' } } },
    });
    if (!cat) throw new NotFoundException('Categoria não encontrada.');
    return cat;
  }

  async create(dto: CreateCategoryDto) {
    const slug = dto.slug ?? slugify(dto.name);
    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name,
          slug,
          description: dto.description,
          icon: dto.icon,
          color: dto.color,
          order: dto.order ?? 0,
          visible: dto.visible ?? true,
        },
      });
    } catch (e) {
      if (isPrismaCode(e, 'P2002')) {
        throw new ConflictException(`Slug "${slug}" já existe.`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    try {
      return await this.prisma.category.update({
        where: { id },
        data: dto,
      });
    } catch (e) {
      if (isPrismaCode(e, 'P2025')) {
        throw new NotFoundException('Categoria não encontrada.');
      }
      if (isPrismaCode(e, 'P2002')) {
        throw new ConflictException('Slug já existe.');
      }
      throw e;
    }
  }

  async remove(id: string) {
    try {
      await this.prisma.category.delete({ where: { id } });
      return { ok: true };
    } catch (e) {
      if (isPrismaCode(e, 'P2025')) {
        throw new NotFoundException('Categoria não encontrada.');
      }
      throw e;
    }
  }

  async addSubtopic(categoryId: string, dto: CreateSubtopicDto) {
    try {
      return await this.prisma.subtopic.create({
        data: {
          categoryId,
          label: dto.label,
          order: dto.order ?? 0,
        },
      });
    } catch (e) {
      if (isPrismaCode(e, 'P2003')) {
        throw new NotFoundException('Categoria não encontrada.');
      }
      throw e;
    }
  }

  async removeSubtopic(subtopicId: string) {
    try {
      await this.prisma.subtopic.delete({ where: { id: subtopicId } });
      return { ok: true };
    } catch (e) {
      if (isPrismaCode(e, 'P2025')) {
        throw new NotFoundException('Sub-tópico não encontrado.');
      }
      throw e;
    }
  }
}
