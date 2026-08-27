import { Test } from '@nestjs/testing';
import { CategoriesService } from './categories.service';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryTreeService } from './category-tree.service';
import { ConflictException, NotFoundException } from '@nestjs/common';

function makeTreeMock() {
  return { invalidate: jest.fn().mockResolvedValue(undefined) };
}

/**
 * create() and addSubtopic() run inside prisma.$transaction(async tx => ...).
 * $transaction here just invokes the callback with `mock` itself, so
 * tx.category.create / tx.category.update are the SAME jest.fn()s as
 * prisma.category.create / .update — one shared mock, not a second
 * unconnected one that assertions would silently miss.
 */
function makePrismaMock() {
  const mock = {
    category: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      // Children count, checked by remove() alongside article.count.
      count: jest.fn().mockResolvedValue(0),
    },
    article: {
      count: jest.fn().mockResolvedValue(0),
    },
    $transaction: jest.fn(),
  };
  mock.$transaction.mockImplementation((fn: (tx: typeof mock) => unknown) =>
    fn(mock),
  );
  return mock;
}

describe('CategoriesService', () => {
  let service: CategoriesService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let tree: ReturnType<typeof makeTreeMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    tree = makeTreeMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        CategoriesService,
        { provide: PrismaService, useValue: prisma },
        { provide: CategoryTreeService, useValue: tree },
      ],
    }).compile();
    service = moduleRef.get(CategoriesService);
  });

  describe('create()', () => {
    it('auto-generates a slug from the name when none is provided', async () => {
      // findUnique inside uniqueSlug() reports the desired slug is free.
      prisma.category.findUnique.mockResolvedValueOnce(null);
      prisma.category.create.mockResolvedValueOnce({ id: 'c1', path: '/' });
      prisma.category.update.mockResolvedValueOnce({ id: 'c1', path: '/c1/' });

      await service.create({
        name: 'Tecnologia & Saúde',
        description: 'd',
        icon: '◆',
        color: '#000',
      });

      expect(prisma.category.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: 'tecnologia-saude',
          depth: 0,
        }),
      });
      // Root categories get a self-inclusive path filled in right after
      // creation — the id is only known once the row exists.
      expect(prisma.category.update).toHaveBeenCalledWith({
        where: { id: 'c1' },
        data: { path: '/c1/' },
      });
    });

    it('respects an explicit slug when provided, if it is free', async () => {
      prisma.category.findUnique.mockResolvedValueOnce(null);
      prisma.category.create.mockResolvedValueOnce({ id: 'c1', path: '/' });
      prisma.category.update.mockResolvedValueOnce({ id: 'c1', path: '/c1/' });

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

    it('disambiguates a taken slug rather than colliding with it', async () => {
      // The desired slug is taken; the -2 fallback is free. No parentSlug
      // is passed for a root category, so the parent-suffix branch is
      // skipped entirely.
      prisma.category.findUnique
        .mockResolvedValueOnce({ id: 'other' }) // "economia" taken
        .mockResolvedValueOnce(null); // "economia-2" free
      prisma.category.create.mockResolvedValueOnce({ id: 'c2', path: '/' });
      prisma.category.update.mockResolvedValueOnce({ id: 'c2', path: '/c2/' });

      await service.create({
        name: 'Economia',
        description: '',
        icon: '◆',
        color: '#000',
      });

      expect(prisma.category.create.mock.calls[0][0].data.slug).toBe(
        'economia-2',
      );
    });

    it('invalidates the cached tree after a successful create', async () => {
      prisma.category.findUnique.mockResolvedValueOnce(null);
      prisma.category.create.mockResolvedValueOnce({ id: 'c1', path: '/' });
      prisma.category.update.mockResolvedValueOnce({ id: 'c1', path: '/c1/' });

      await service.create({ name: 'X', description: '', icon: '◆', color: '#000' });

      expect(tree.invalidate).toHaveBeenCalledTimes(1);
    });

    it('throws ConflictException when the slug already exists', async () => {
      prisma.category.findUnique.mockResolvedValueOnce(null);
      const err = Object.assign(new Error('Unique constraint'), {
        code: 'P2002',
      });
      prisma.category.create.mockRejectedValueOnce(err);
      await expect(
        service.create({ name: 'X', description: '', icon: '◆', color: '#000' }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects an EXPLICIT slug collision rather than silently renaming it', async () => {
      // uniqueSlug() only runs for a name-derived slug. A slug the editor
      // typed on purpose must not become "cultura-2" behind their back —
      // it has to fail loudly, the same way it always did.
      const err = Object.assign(new Error('Unique constraint'), {
        code: 'P2002',
      });
      prisma.category.create.mockRejectedValueOnce(err);

      await expect(
        service.create({
          name: 'Cultura',
          slug: 'cultura',
          description: '',
          icon: '◆',
          color: '#000',
        }),
      ).rejects.toThrow(ConflictException);
      // And critically: never even consulted uniqueSlug()'s lookup.
      expect(prisma.category.findUnique).not.toHaveBeenCalled();
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
      prisma.category.count.mockResolvedValueOnce(0);

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

    it('refuses to delete a category that still has children', async () => {
      // parentId is onDelete: Restrict, so leaving this unchecked would
      // just move the exact same P2003 problem one relation over.
      prisma.category.findUnique.mockResolvedValueOnce({
        id: 'c1',
        name: 'Portugal',
      });
      prisma.article.count.mockResolvedValueOnce(0);
      prisma.category.count.mockResolvedValueOnce(5);

      await expect(service.remove('c1')).rejects.toThrow(
        /Portugal.*5 subcategorias/,
      );
      expect(prisma.category.delete).not.toHaveBeenCalled();
    });

    it('turns a racing P2003 into a 409, not a 500', async () => {
      // An article (or child category) created between the counts above
      // and the delete.
      prisma.category.findUnique.mockResolvedValueOnce({
        id: 'c1',
        name: 'Política',
      });
      prisma.article.count.mockResolvedValueOnce(0);
      prisma.category.count.mockResolvedValueOnce(0);
      prisma.category.delete.mockRejectedValueOnce(
        Object.assign(new Error('FK'), { code: 'P2003' }),
      );

      await expect(service.remove('c1')).rejects.toThrow(ConflictException);
    });

    it('invalidates the cached tree after a successful delete', async () => {
      prisma.category.findUnique.mockResolvedValueOnce({
        id: 'c1',
        name: 'Política',
      });
      prisma.article.count.mockResolvedValueOnce(0);
      prisma.category.count.mockResolvedValueOnce(0);

      await service.remove('c1');

      expect(tree.invalidate).toHaveBeenCalledTimes(1);
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
        {
          id: 'c1',
          slug: 'politica',
          name: 'Política',
          children: [],
          _count: { articles: 7 },
        },
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

    it('exposes children both as the tree and as the legacy subtopics alias', async () => {
      // subtopics: string-label shim kept for one release so
      // frontend/src/lib/categories.ts (CategoryDef.subtopics: string[])
      // and the older API consumers don't break in the same commit that
      // absorbed the Subtopic model into real Category children.
      prisma.category.findMany.mockResolvedValueOnce([
        {
          id: 'c1',
          slug: 'portugal',
          name: 'Portugal',
          children: [
            { id: 'ch1', name: 'Norte', order: 0 },
            { id: 'ch2', name: 'Centro', order: 1 },
          ],
          _count: { articles: 0 },
        },
      ]);

      const [item] = (await service.listPublic()) as Array<{
        children: unknown[];
        subtopics: { id: string; label: string; order: number }[];
      }>;

      expect(item.children).toHaveLength(2);
      expect(item.subtopics).toEqual([
        { id: 'ch1', label: 'Norte', order: 0 },
        { id: 'ch2', label: 'Centro', order: 1 },
      ]);
    });
  });
});
