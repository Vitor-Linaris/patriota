import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ReaderLibraryService } from './reader-library.service';
import { PrismaService } from '../prisma/prisma.service';
import { CategoryTreeService } from '../categories/category-tree.service';

/**
 * The library as a second door onto an article's lifecycle.
 *
 * `saveArticle()` and `trackRead()` both refuse anything that is not
 * PUBLICADO, and they say why: an endpoint that answers differently for
 * a draft that exists and a draft that does not is an existence oracle
 * for unpublished work. The rows they write, and the state they report,
 * have to keep asking the same question — a favourite outlives the
 * condition that allowed it, and a retraction is exactly the case that
 * matters.
 */
function makePrismaMock() {
  return {
    article: { findUnique: jest.fn() },
    articleFavorite: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    readingHistory: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      findUnique: jest.fn().mockResolvedValue(null),
    },
    categoryFavorite: { findUnique: jest.fn().mockResolvedValue(null) },
    comment: { count: jest.fn().mockResolvedValue(0) },
  };
}

describe('ReaderLibraryService — lifecycle on the way out', () => {
  let service: ReaderLibraryService;
  let prisma: ReturnType<typeof makePrismaMock>;

  beforeEach(async () => {
    prisma = makePrismaMock();
    const moduleRef = await Test.createTestingModule({
      providers: [
        ReaderLibraryService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: CategoryTreeService,
          useValue: {
            getById: jest
              .fn()
              .mockResolvedValue({ id: 'cat1', path: '/cat1/', name: 'Política', slug: 'politica' }),
          },
        },
      ],
    }).compile();
    service = moduleRef.get(ReaderLibraryService);
  });

  /** The `where` a paged list handed to Prisma. */
  const whereOf = (m: jest.Mock) =>
    (m.mock.calls[0]![0] as { where: Record<string, unknown> }).where;

  it('lists only saved articles that are still published', async () => {
    await service.listArticleFavorites('r1', {} as never);

    expect(whereOf(prisma.articleFavorite.findMany)).toMatchObject({
      readerId: 'r1',
      article: { status: 'PUBLICADO' },
    });
  });

  it('counts saved articles with the same predicate it lists them by', async () => {
    await service.listArticleFavorites('r1', {} as never);

    // A `where` on the page but not on the count gives a total that
    // disagrees with the rows under it, and a last page of nothing.
    expect(whereOf(prisma.articleFavorite.count)).toEqual(
      whereOf(prisma.articleFavorite.findMany),
    );
  });

  it('applies the same rule to reading history, page and count alike', async () => {
    await service.listHistory('r1', {} as never);

    expect(whereOf(prisma.readingHistory.findMany)).toMatchObject({
      readerId: 'r1',
      article: { status: 'PUBLICADO' },
    });
    expect(whereOf(prisma.readingHistory.count)).toEqual(
      whereOf(prisma.readingHistory.findMany),
    );
  });

  it('answers articleState for a published article', async () => {
    prisma.article.findUnique.mockResolvedValueOnce({
      id: 'a1',
      categoryId: 'cat1',
      status: 'PUBLICADO',
    });

    await expect(service.articleState('r1', 'a1')).resolves.toMatchObject({
      articleId: 'a1',
    });
  });

  it('refuses articleState for a draft exactly as it refuses a missing id', async () => {
    // The regression: this checked only for a missing row, so a guessed
    // id came back 200 with the article's root category attached —
    // telling an anonymous-adjacent caller that an unpublished piece
    // exists, and roughly what section it is being written for.
    prisma.article.findUnique.mockResolvedValueOnce({
      id: 'a1',
      categoryId: 'cat1',
      status: 'RASCUNHO',
    });

    await expect(service.articleState('r1', 'a1')).rejects.toThrow(
      NotFoundException,
    );

    prisma.article.findUnique.mockResolvedValueOnce(null);
    await expect(service.articleState('r1', 'missing')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('refuses an archived article too', async () => {
    // A retraction is the case that matters: the piece was public, it is
    // not any more, and the library must not keep a door open to it.
    prisma.article.findUnique.mockResolvedValueOnce({
      id: 'a1',
      categoryId: 'cat1',
      status: 'ARQUIVADO',
    });

    await expect(service.articleState('r1', 'a1')).rejects.toThrow(
      NotFoundException,
    );
  });
});
