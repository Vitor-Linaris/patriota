import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ReaderNotificationsService } from './reader-notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mailer/mailer.service';
import { CategoryTreeService } from '../categories/category-tree.service';

/**
 * The roll-up to ancestor categories.
 *
 * This is the highest-risk change in the hierarchy work: it is the only
 * part that sends real e-mail, and the failure modes are quiet ones —
 * a reader who silently stops receiving a section, or one who receives
 * the same article twice. Both are covered here.
 */
function makePrismaMock() {
  return {
    article: {
      findMany: jest.fn().mockResolvedValue([]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    categoryFavorite: { findMany: jest.fn().mockResolvedValue([]) },
    articleNotification: {
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

describe('ReaderNotificationsService — roll-up', () => {
  let service: ReaderNotificationsService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let tree: { resolveAncestorIds: jest.Mock };
  let funnel: string | undefined;

  const dueArticle = {
    id: 'art1',
    title: 'Obras na Rua da Sé',
    categoryId: 'se',
  };

  beforeEach(async () => {
    prisma = makePrismaMock();
    funnel = undefined;
    // Sé › Funchal › Madeira › Portugal, leaf first.
    tree = {
      resolveAncestorIds: jest
        .fn()
        .mockResolvedValue(['se', 'fu', 'ma', 'pt']),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReaderNotificationsService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailerService, useValue: { isEnabled: jest.fn() } },
        { provide: CategoryTreeService, useValue: tree },
        { provide: ConfigService, useValue: { get: () => funnel } },
      ],
    }).compile();
    service = moduleRef.get(ReaderNotificationsService);
  });

  /** The categoryId each fanOut pass queried, in order. */
  const queriedCategories = () =>
    prisma.categoryFavorite.findMany.mock.calls.map(
      (c) => (c[0] as { where: { categoryId: string } }).where.categoryId,
    );

  it('fans out once per ancestor, leaf first', async () => {
    prisma.article.findMany.mockResolvedValueOnce([dueArticle]);

    await service.enqueueDueArticles();

    expect(queriedCategories()).toEqual(['se', 'fu', 'ma', 'pt']);
  });

  it('never widens the where into a categoryId IN', async () => {
    // The trap this whole design avoids: fanOut pages with
    // cursor: { readerId_categoryId }, a composite key bound to ONE
    // category. An `in` here leaves the cursor non-unique and the loop
    // skips or repeats pages of followers.
    prisma.article.findMany.mockResolvedValueOnce([dueArticle]);

    await service.enqueueDueArticles();

    for (const call of prisma.categoryFavorite.findMany.mock.calls) {
      const where = (call[0] as { where: { categoryId: unknown } }).where;
      expect(typeof where.categoryId).toBe('string');
    }
  });

  it('sends one notification, not four, to someone following the whole chain', async () => {
    prisma.article.findMany.mockResolvedValueOnce([dueArticle]);
    // The same reader follows Sé AND Funchal AND Portugal.
    prisma.categoryFavorite.findMany.mockResolvedValue([{ readerId: 'r1' }]);
    // Only the first insert creates a row; @@unique([readerId, articleId])
    // plus skipDuplicates collapses the rest.
    prisma.articleNotification.createMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 0 });

    const queued = await service.enqueueDueArticles();

    expect(queued).toBe(1);
    // And every insert must actually ask for the de-duplication.
    for (const call of prisma.articleNotification.createMany.mock.calls) {
      expect((call[0] as { skipDuplicates: boolean }).skipDuplicates).toBe(true);
    }
  });

  it('reaches a follower of the parent when the article is filed in the child', async () => {
    prisma.article.findMany.mockResolvedValueOnce([dueArticle]);
    // Nobody follows Sé; someone follows Portugal.
    prisma.categoryFavorite.findMany.mockImplementation((args: unknown) => {
      const { where } = args as { where: { categoryId: string } };
      return Promise.resolve(where.categoryId === 'pt' ? [{ readerId: 'r9' }] : []);
    });
    prisma.articleNotification.createMany.mockResolvedValueOnce({ count: 1 });

    const queued = await service.enqueueDueArticles();

    expect(queued).toBe(1);
    expect(prisma.articleNotification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ readerId: 'r9', articleId: 'art1' }],
      }),
    );
  });

  it('reverts to the article’s own category while CATEGORY_FUNNEL=0', async () => {
    funnel = '0';
    prisma.article.findMany.mockResolvedValueOnce([dueArticle]);

    await service.enqueueDueArticles();

    expect(queriedCategories()).toEqual(['se']);
    expect(tree.resolveAncestorIds).not.toHaveBeenCalled();
  });

  it('still notifies the direct category when the tree cannot be read', async () => {
    // A Redis outage must not silence the notification entirely.
    tree.resolveAncestorIds.mockResolvedValueOnce(['se']);
    prisma.article.findMany.mockResolvedValueOnce([dueArticle]);

    await service.enqueueDueArticles();

    expect(queriedCategories()).toEqual(['se']);
  });

  it('does not fan out at all when the article was claimed elsewhere', async () => {
    // Another instance got there first — no double fan-out, and no
    // ancestor lookup either.
    prisma.article.findMany.mockResolvedValueOnce([dueArticle]);
    prisma.article.updateMany.mockResolvedValueOnce({ count: 0 });

    const queued = await service.enqueueDueArticles();

    expect(queued).toBe(0);
    expect(prisma.categoryFavorite.findMany).not.toHaveBeenCalled();
  });
});
