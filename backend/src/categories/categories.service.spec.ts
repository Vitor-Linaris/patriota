import { Test } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

function makePrismaMock() {
  return {
    category: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    subtopic: {
      create: jest.fn(),
      delete: jest.fn(),
      findUnique: jest.fn(),
    },
    article: {
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = moduleRef.get(CategoriesService);
  });

  describe('create()', () => {
    it('auto-generates a slug from the name when none is provided', async () => {
      prisma.category.create.mockResolvedValueOnce({ id: 'c1' });
      await service.create({
        name: 'Tecnologia & Saúde',
        description: 'd',
        icon: '◆',
        color: '#000',
      });
      expect(prisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ slug: 'tecnologia-saude' }),
      });
    });

    it('respects an explicit slug when provided', async () => {
      prisma.category.create.mockResolvedValueOnce({ id: 'c1' });
      await service.create({
        name: 'Cultura',
        slug: 'my-custom-slug',
        description: '',
        icon: '◆',
        color: '#000',
      });
      expect(prisma.category.create.mock.calls[0][0].data.slug).toBe(
        'my-custom-slug',
      );
    });

    it('throws ConflictException when the slug already exists', async () => {
      const err = Object.assign(new Error('Unique constraint'), {
        code: 'P2002',
      });
      prisma.category.create.mockRejectedValueOnce(err);
      await expect(
        service.create({ name: 'X', description: '', icon: '◆', color: '#000' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('remove()', () => {
    it('throws NotFoundException when the category does not exist', async () => {
      const err = Object.assign(new Error('Record not found'), {
        code: 'P2025',
      });
      prisma.category.findUnique.mockResolvedValueOnce({ id: 'missing', name: 'X' });
      prisma.category.delete.mockRejectedValueOnce(err);
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });

    it('404s before touching the database when the category is gone', async () => {
      prisma.category.findUnique.mockResolvedValueOnce(null);

      await expect(service.remove('nao-existe')).rejects.toThrow(
        NotFoundException,
      );
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });

    it('refuses to delete a category that still holds articles', async () => {
      // This used to escape as a raw 500: Article.category has no
      // onDelete, so Postgres raised P2003 and nothing caught it.
      prisma.category.findUnique.mockResolvedValueOnce({
        id: 'c1',
        name: 'Política',
      });
      prisma.article.count.mockResolvedValueOnce(7);

      await expect(service.remove('c1')).rejects.toThrow(ConflictException);
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });

    it('names the category and the count so the editor can act on it', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({
        id: 'c1',
        name: 'Política',
      });
      prisma.article.count.mockResolvedValueOnce(1);

      await expect(service.remove('c1')).rejects.toThrow(
        /Política.*1 artigo associado/,
      );
    });

    it('turns a racing P2003 into a 409, not a 500', async () => {
      // An article created between the count above and the delete.
      prisma.category.findUnique.mockResolvedValueOnce({
        id: 'c1',
        name: 'Política',
      });
      prisma.article.count.mockResolvedValueOnce(0);
      prisma.category.delete.mockRejectedValueOnce(
        Object.assign(new Error('FK'), { code: 'P2003' }),
      );

      await expect(service.remove('c1')).rejects.toThrow(ConflictException);
    });
  });

  describe('listPublic()', () => {
    /**
     * Asserts BEHAVIOUR, not the shape of the Prisma call.
     *
     * An earlier version pinned the literal where/orderBy/include of the
     * query, which meant every change to how the list is built — adding
     * a hierarchy, changing the sort, dropping Subtopic — broke a test
     * that was not actually protecting anything.
     *
     * The one query detail still asserted is `visible: true`, because
     * that one IS the contract: a regression there leaks hidden
     * categories onto the public site.
     */
    it('never exposes hidden categories', async () => {
      prisma.category.findMany.mockResolvedValueOnce([]);
      await service.listPublic();

      const where = prisma.category.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ visible: true });
    });

    it('surfaces the published-article count and hides the raw _count', async () => {
      prisma.category.findMany.mockResolvedValueOnce([
        { id: 'c1', slug: 'politica', name: 'Política', _count: { articles: 7 } },
      ]);

      const [item] = (await service.listPublic()) as Array<
        Record<string, unknown>
      >;

      expect(item.articleCount).toBe(7);
      expect(item.slug).toBe('politica');
      // _count is an implementation detail of the query and must not
      // reach the public payload.
      expect(item).not.toHaveProperty('_count');
    });
  });
});
