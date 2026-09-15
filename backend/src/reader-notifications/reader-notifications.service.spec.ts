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
      resolveAncestorIds: jest.fn().mockResolvedValue(['se', 'fu', 'ma', 'pt']),
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
      expect((call[0] as { skipDuplicates: boolean }).skipDuplicates).toBe(
        true,
      );
    }
  });

  it('reaches a follower of the parent when the article is filed in the child', async () => {
    prisma.article.findMany.mockResolvedValueOnce([dueArticle]);
    // Nobody follows Sé; someone follows Portugal.
    prisma.categoryFavorite.findMany.mockImplementation((args: unknown) => {
      const { where } = args as { where: { categoryId: string } };
      return Promise.resolve(
        where.categoryId === 'pt' ? [{ readerId: 'r9' }] : [],
      );
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

/**
 * The digest as a SECOND reader of Article.content.
 *
 * The paywall in articles.service.ts is not the only code that puts an
 * article body in front of a person. This one chooses its recipients by
 * category follow and asks nothing about entitlement anywhere on the
 * path — so whatever it selects, it mails to every free follower, into
 * an inbox, where no further authorisation will ever apply.
 */
describe('ReaderNotificationsService — deliver', () => {
  let service: ReaderNotificationsService;
  let prisma: {
    articleNotification: { findMany: jest.Mock; updateMany: jest.Mock };
  };
  let sendOrThrow: jest.Mock;

  const BODY = 'Corpo pago que ninguem fora do paywall devia ler.';

  function pendingRow(over: { exclusive: boolean }) {
    return {
      id: 'n1',
      readerId: 'r1',
      reader: { email: 'ana@exemplo.pt', name: 'Ana', unsubscribeToken: 'tok' },
      article: {
        slug: 'investigacao',
        title: 'Investigacao',
        summary: 'O resumo publico.',
        content: BODY,
        exclusive: over.exclusive,
        publishedAt: new Date(),
        category: { slug: 'politica', name: 'Politica' },
        packageEntries: [],
      },
    };
  }

  beforeEach(async () => {
    sendOrThrow = jest.fn().mockResolvedValue(undefined);
    prisma = {
      articleNotification: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReaderNotificationsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: MailerService,
          useValue: {
            isEnabled: jest.fn().mockResolvedValue(true),
            siteName: jest.fn().mockResolvedValue('O Patriota Noticias'),
            siteUrl: jest.fn().mockReturnValue('https://opatriota.pt'),
            sendOrThrow,
          },
        },
        {
          provide: CategoryTreeService,
          useValue: { resolveAncestorIds: jest.fn() },
        },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();
    service = moduleRef.get(ReaderNotificationsService);
  });

  /** The columns the digest asks the database for, flattened. */
  const articleSelect = () =>
    (
      prisma.articleNotification.findMany.mock.calls[0]![0] as {
        select: { article: { select: Record<string, unknown> } };
      }
    ).select.article.select;

  it('asks for the exclusive flag alongside the body', async () => {
    await service.deliver('DIARIO');

    // Without this column there is nothing to decide on, and the check
    // below cannot exist at all.
    expect(articleSelect().exclusive).toBe(true);
  });

  it('never puts the body of an exclusive in the e-mail', async () => {
    prisma.articleNotification.findMany.mockResolvedValueOnce([
      pendingRow({ exclusive: true }),
    ]);

    await service.deliver('DIARIO');

    const mail = sendOrThrow.mock.calls[0]![0] as {
      html: string;
      text: string;
    };
    // Not a word of it, in either part. The e-mail still goes out, and
    // still invites the reader to come and read the piece.
    expect(mail.html).not.toContain('Corpo pago');
    expect(mail.text).not.toContain('Corpo pago');
    expect(mail.html).toContain('O resumo publico.');
    expect(mail.html).toContain('/artigo/investigacao');
  });

  it('still carries the opening of a free article', async () => {
    prisma.articleNotification.findMany.mockResolvedValueOnce([
      pendingRow({ exclusive: false }),
    ]);

    await service.deliver('DIARIO');

    const mail = sendOrThrow.mock.calls[0]![0] as { html: string };
    // The excerpt is what makes somebody open the e-mail; withholding it
    // from everything would be the wrong fix.
    expect(mail.html).toContain('Corpo pago');
  });
});
