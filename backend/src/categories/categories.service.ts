import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { CreateSubtopicDto } from './dto/subtopic.dto';
import { CategoryTreeService } from './category-tree.service';

/** Max depth is 4 levels: categoria(0) -> subcategoria -> topico -> subtopico(3). */
const MAX_DEPTH = 3;

function baseSlug(input: string): string {
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

/** Shape returned to every existing consumer — see the note on subtopics below. */
const CHILDREN_INCLUDE = {
  children: { orderBy: { order: 'asc' as const } },
};

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tree: CategoryTreeService,
  ) {}

  /**
   * Disambiguates a slug at authoring time rather than scoping
   * uniqueness to a parent. Category.slug stays globally @unique so
   * public URLs stay flat (/categoria/funchal at any depth) — re-parenting
   * a node during a drag never breaks a published link.
   *
   * "economia" taken -> "economia-mundo" (parent slug suffix) ->
   * "economia-2". Never silently reuses an unrelated existing slug.
   */
  private async uniqueSlug(
    desired: string,
    parentSlug?: string,
  ): Promise<string> {
    const exists = (slug: string) =>
      this.prisma.category.findUnique({ where: { slug }, select: { id: true } });

    if (!(await exists(desired))) return desired;

    if (parentSlug) {
      const withParent = `${desired}-${parentSlug}`;
      if (!(await exists(withParent))) return withParent;
    }

    for (let n = 2; n < 1000; n++) {
      const candidate = `${desired}-${n}`;
      if (!(await exists(candidate))) return candidate;
    }
    // Unreachable in practice; satisfies the compiler and fails loudly
    // instead of looping forever if it somehow is.
    throw new ConflictException('Não foi possível gerar um slug único.');
  }

  /**
   * subtopics: string[] label alias, computed from `children`.
   *
   * Subtopic used to be its own decorative model — nothing filtered by
   * it, Article has no subtopicId. It is now absorbed into Category as
   * real depth-1 nodes (see the category_hierarchy migration), which
   * makes them actually clickable instead of dead label chips.
   *
   * The alias exists so CategoryDef in the frontend and the older
   * consumers of this endpoint don't need to change in the same release
   * that changed the schema. Remove once the frontend reads `children`
   * directly.
   */
  private withSubtopicsAlias<
    T extends { children: { id: string; name: string; order: number }[] },
  >(category: T) {
    const { children, ...rest } = category;
    return {
      ...rest,
      children,
      subtopics: children.map((c) => ({
        id: c.id,
        label: c.name,
        order: c.order,
      })),
    };
  }

  listAdmin() {
    return this.prisma.category
      .findMany({
        // Only roots at the top level for now — the admin tree UI lands
        // in a later commit. Until then this preserves today's flat
        // list, now correctly excluding depth-1+ rows that used to only
        // exist as Subtopic and never appeared here as siblings.
        where: { parentId: null },
        orderBy: { order: 'asc' },
        include: CHILDREN_INCLUDE,
      })
      .then((items) => items.map((c) => this.withSubtopicsAlias(c)));
  }

  async listPublic() {
    const items = await this.prisma.category.findMany({
      where: { visible: true, parentId: null },
      orderBy: { order: 'asc' },
      include: {
        ...CHILDREN_INCLUDE,
        _count: {
          select: {
            articles: { where: { status: 'PUBLICADO' } },
          },
        },
      },
    });
    // Surface the count under a stable name so the public API stays small.
    return items.map((c) => {
      const { _count, ...rest } = c;
      return { ...this.withSubtopicsAlias(rest), articleCount: _count.articles };
    });
  }

  async findBySlug(slug: string) {
    const cat = await this.prisma.category.findUnique({
      where: { slug },
      include: CHILDREN_INCLUDE,
    });
    if (!cat) throw new NotFoundException('Categoria não encontrada.');
    return this.withSubtopicsAlias(cat);
  }

  /**
   * Creates a ROOT category. Nested creation (a category with a parent)
   * lands with the admin tree CRUD in a later commit — this keeps
   * today's "flat list of top-level sections" behaviour exactly as it
   * was, just now aware that a category may (via addSubtopic, or later
   * the tree UI) have children.
   */
  async create(dto: CreateCategoryDto) {
    // Auto-disambiguation only applies to a slug DERIVED from the name.
    // An explicitly chosen slug keeps the old strict behaviour — 409 on
    // collision — because silently renaming what an editor typed on
    // purpose (into "cultura-2") would be a surprise, not a courtesy.
    // The admin form is where disambiguation belongs for explicit input:
    // a live availability check, per the plan.
    const slug = dto.slug ?? (await this.uniqueSlug(baseSlug(dto.name)));
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const created = await tx.category.create({
          data: {
            name: dto.name,
            slug,
            description: dto.description,
            icon: dto.icon,
            color: dto.color,
            order: dto.order ?? 0,
            visible: dto.visible ?? true,
            depth: 0,
            path: '/',
          },
        });
        return tx.category.update({
          where: { id: created.id },
          data: { path: `/${created.id}/` },
        });
      });
      await this.tree.invalidate();
      return result;
    } catch (e) {
      if (isPrismaCode(e, 'P2002')) {
        throw new ConflictException(`Slug "${slug}" já existe.`);
      }
      throw e;
    }
  }

  async update(id: string, dto: UpdateCategoryDto) {
    try {
      const result = await this.prisma.category.update({
        where: { id },
        data: dto,
      });
      await this.tree.invalidate();
      return result;
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

  /**
   * Deleting a category that still holds articles used to surface as a
   * raw 500: Article.category has no onDelete, so Postgres raises a
   * foreign-key violation (P2003) and nothing caught it.
   *
   * Checked up front rather than only caught, so the editor is told HOW
   * MANY articles are in the way instead of just being refused — the
   * same courtesy MediaService.remove() already extends for images in
   * use. The catch below stays as the race-condition backstop, and now
   * also covers a category that gained children after the check above
   * (parentId is onDelete: Restrict).
   */
  async remove(id: string) {
    const category = await this.prisma.category.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!category) throw new NotFoundException('Categoria não encontrada.');

    const [articleCount, childCount] = await Promise.all([
      this.prisma.article.count({ where: { categoryId: id } }),
      this.prisma.category.count({ where: { parentId: id } }),
    ]);
    if (articleCount > 0) {
      throw new ConflictException(
        `Categoria "${category.name}" tem ${articleCount} ` +
          `${articleCount === 1 ? 'artigo associado' : 'artigos associados'}. ` +
          'Mova-os para outra categoria antes de eliminar.',
      );
    }
    if (childCount > 0) {
      throw new ConflictException(
        `Categoria "${category.name}" tem ${childCount} ` +
          `${childCount === 1 ? 'subcategoria' : 'subcategorias'}. ` +
          'Elimine-as ou mova-as antes de eliminar esta categoria.',
      );
    }

    try {
      await this.prisma.category.delete({ where: { id } });
      await this.tree.invalidate();
      return { ok: true };
    } catch (e) {
      if (isPrismaCode(e, 'P2025')) {
        throw new NotFoundException('Categoria não encontrada.');
      }
      // Backstop: an article, or a child category, created between the
      // checks above and this delete.
      if (isPrismaCode(e, 'P2003')) {
        throw new ConflictException(
          'Categoria em uso. Remova o que depende dela antes de eliminar.',
        );
      }
      throw e;
    }
  }

  /**
   * Shim over the tree: creates a real depth-1 Category rather than a
   * Subtopic row. Kept under the old route/method name for one release
   * so the admin UI and any external caller don't need to change in the
   * same commit that changed the schema. The tree CRUD commit replaces
   * this with a general "create at any depth" path and removes the shim.
   */
  async addSubtopic(categoryId: string, dto: CreateSubtopicDto) {
    const parent = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true, path: true, depth: true, icon: true, color: true, slug: true },
    });
    if (!parent) throw new NotFoundException('Categoria não encontrada.');
    if (parent.depth + 1 > MAX_DEPTH) {
      throw new BadRequestException(
        'Profundidade máxima da árvore de categorias atingida.',
      );
    }

    const slug = await this.uniqueSlug(baseSlug(dto.label), parent.slug);

    const child = await this.prisma.$transaction(async (tx) => {
      const created = await tx.category.create({
        data: {
          name: dto.label,
          slug,
          description: '',
          icon: parent.icon,
          color: parent.color,
          order: dto.order ?? 0,
          visible: true,
          parentId: parent.id,
          depth: parent.depth + 1,
          path: '/',
        },
      });
      return tx.category.update({
        where: { id: created.id },
        data: { path: `${parent.path}${created.id}/` },
      });
    });
    await this.tree.invalidate();

    // Shaped like the old Subtopic row (id/label/order) rather than the
    // raw Category, so callers that read `.label` off the response —
    // the admin UI included — keep working unchanged for this release.
    return { id: child.id, label: child.name, order: child.order };
  }

  /** Shim: deletes the depth-1 Category created by addSubtopic. */
  async removeSubtopic(subtopicId: string) {
    try {
      await this.prisma.category.delete({ where: { id: subtopicId } });
      await this.tree.invalidate();
      return { ok: true };
    } catch (e) {
      if (isPrismaCode(e, 'P2025')) {
        throw new NotFoundException('Sub-tópico não encontrado.');
      }
      if (isPrismaCode(e, 'P2003')) {
        throw new ConflictException(
          'Este sub-tópico tem categorias-filhas ou artigos associados.',
        );
      }
      throw e;
    }
  }
}
