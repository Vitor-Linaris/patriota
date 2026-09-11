import { Test } from '@nestjs/testing';
import type Stripe from 'stripe';
import { PackagePurchasesService } from './package-purchases.service';
import { PrismaService } from '../prisma/prisma.service';
import { StripeService } from '../billing/stripe.service';
import { ActivityLogService } from '../activity-log/activity-log.service';
import { ConfigService } from '@nestjs/config';

/** A transaction client with the same shape the service reaches for. */
function makeTx() {
  return {
    stripeEvent: { create: jest.fn() },
    packagePurchase: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    packagePurchaseItem: { createMany: jest.fn() },
    reader: { updateMany: jest.fn() },
  };
}

const event = (over: object = {}) =>
  ({
    id: 'evt_1',
    type: 'checkout.session.completed',
    ...over,
  }) as Stripe.Event;

const session = (over: object = {}) =>
  ({
    id: 'cs_1',
    mode: 'payment',
    payment_status: 'paid',
    amount_total: 990,
    currency: 'eur',
    customer: 'cus_1',
    payment_intent: 'pi_1',
    metadata: {
      kind: 'pacote',
      readerId: 'r1',
      packageId: 'p1',
      purchaseId: 'pur1',
    },
    ...over,
  }) as unknown as Stripe.Checkout.Session;

const PURCHASE = {
  id: 'pur1',
  readerId: 'r1',
  packageId: 'p1',
  status: 'PENDENTE',
  amountCents: 990,
  currency: 'EUR',
  snapshotArticleIds: ['a1', 'a2', 'a3'],
};

describe('PackagePurchasesService', () => {
  let service: PackagePurchasesService;
  let prisma: Record<string, any>;
  let tx: ReturnType<typeof makeTx>;

  beforeEach(async () => {
    tx = makeTx();
    prisma = {
      package: { findFirst: jest.fn(), findUnique: jest.fn() },
      reader: { findUnique: jest.fn() },
      article: { findMany: jest.fn().mockResolvedValue([]) },
      packagePurchase: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      packagePurchaseItem: { createMany: jest.fn(), deleteMany: jest.fn() },
      stripeEvent: { create: jest.fn() },
      $transaction: jest.fn((cb: (c: unknown) => unknown) =>
        typeof cb === 'function' ? cb(tx) : Promise.resolve([]),
      ),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        PackagePurchasesService,
        { provide: PrismaService, useValue: prisma },
        { provide: StripeService, useValue: { enabled: true, stripe: {} } },
        { provide: ActivityLogService, useValue: { record: jest.fn() } },
        { provide: ConfigService, useValue: { get: () => 'http://localhost:3005' } },
      ],
    }).compile();
    service = moduleRef.get(PackagePurchasesService);
  });

  describe('onCheckoutCompleted()', () => {
    it('grants the SNAPSHOT, not the pacote current contents', async () => {
      prisma.packagePurchase.findUnique.mockResolvedValueOnce(PURCHASE);

      await service.onCheckoutCompleted(event(), session());

      expect(tx.packagePurchaseItem.createMany).toHaveBeenCalledWith({
        data: [
          { purchaseId: 'pur1', articleId: 'a1', readerId: 'r1' },
          { purchaseId: 'pur1', articleId: 'a2', readerId: 'r1' },
          { purchaseId: 'pur1', articleId: 'a3', readerId: 'r1' },
        ],
        skipDuplicates: true,
      });
      // PackageArticle is never consulted here. Rebuilding the list at
      // webhook time would hand the buyer whatever the pacote happens to
      // contain now instead of what they paid for.
      expect(prisma.package.findFirst).not.toHaveBeenCalled();
      expect(prisma.package.findUnique).not.toHaveBeenCalled();
    });

    it('writes the event id in the SAME transaction as the grant', async () => {
      prisma.packagePurchase.findUnique.mockResolvedValueOnce(PURCHASE);
      await service.onCheckoutCompleted(event(), session());
      // Both on `tx`, never on `prisma`: a duplicate delivery hits the
      // StripeEvent primary key and takes the grant down with it.
      expect(tx.stripeEvent.create).toHaveBeenCalledWith({
        data: { id: 'evt_1', type: 'checkout.session.completed', readerId: 'r1' },
      });
      expect(prisma.stripeEvent.create).not.toHaveBeenCalled();
    });

    it('promotes only a PENDENTE row, so a manual replay cannot double-grant', async () => {
      prisma.packagePurchase.findUnique.mockResolvedValueOnce(PURCHASE);
      await service.onCheckoutCompleted(event(), session());
      expect(tx.packagePurchase.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pur1', status: 'PENDENTE' },
        }),
      );
    });

    it('skips the items when the row was already promoted', async () => {
      prisma.packagePurchase.findUnique.mockResolvedValueOnce(PURCHASE);
      tx.packagePurchase.updateMany.mockResolvedValueOnce({ count: 0 });
      await service.onCheckoutCompleted(event(), session());
      expect(tx.packagePurchaseItem.createMany).not.toHaveBeenCalled();
    });

    it('THE COLLISION PIN: touches ONLY stripeCustomerId on the reader', async () => {
      prisma.packagePurchase.findUnique.mockResolvedValueOnce(PURCHASE);
      await service.onCheckoutCompleted(event(), session());

      // plan, planStatus, planRenewsAt, planSource and
      // stripeSubscriptionId all mean "subscription entitled until". A
      // one-off purchase writing any of them would corrupt every
      // subscription figure on the dashboard, and could make
      // BillingService refuse the reader a genuine subscription later.
      expect(tx.reader.updateMany).toHaveBeenCalledWith({
        where: { id: 'r1', stripeCustomerId: null },
        data: { stripeCustomerId: 'cus_1' },
      });
      const data = tx.reader.updateMany.mock.calls[0][0].data;
      expect(Object.keys(data)).toEqual(['stripeCustomerId']);
    });

    it('records the amount Stripe charged, not the pacote current price', async () => {
      prisma.packagePurchase.findUnique.mockResolvedValueOnce(PURCHASE);
      // The price moved after this session opened; the session still
      // completes at what the reader was shown.
      await service.onCheckoutCompleted(
        event(),
        session({ amount_total: 750, currency: 'eur' }),
      );
      expect(tx.packagePurchase.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'PAGO',
            amountCents: 750,
            currency: 'EUR',
            stripePaymentIntentId: 'pi_1',
          }),
        }),
      );
    });

    it('grants nothing while a delayed payment has not settled', async () => {
      await service.onCheckoutCompleted(
        event(),
        session({ payment_status: 'unpaid' }),
      );
      // Multibanco and friends. The money may never arrive.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.stripeEvent.create).toHaveBeenCalledWith({
        data: {
          id: 'evt_1',
          type: 'checkout.session.completed',
          readerId: 'r1',
        },
      });
    });

    it('refuses to invent a snapshot when the purchase row is gone', async () => {
      prisma.packagePurchase.findUnique.mockResolvedValueOnce(null);
      await service.onCheckoutCompleted(event(), session());
      // Recorded and loud, but nothing granted — and still no throw, or
      // Stripe would retry this for three days.
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.stripeEvent.create).toHaveBeenCalled();
    });

    it('falls back to the session id when metadata lost the purchaseId', async () => {
      prisma.packagePurchase.findUnique.mockResolvedValueOnce(PURCHASE);
      await service.onCheckoutCompleted(
        event(),
        session({ metadata: { kind: 'pacote', readerId: 'r1' } }),
      );
      expect(prisma.packagePurchase.findUnique).toHaveBeenCalledWith({
        where: { stripeCheckoutSessionId: 'cs_1' },
      });
    });
  });

  describe('revoke()', () => {
    it('deletes the items and marks the purchase, keeping the snapshot', async () => {
      prisma.packagePurchase.findUnique.mockResolvedValueOnce({
        id: 'pur1',
        status: 'PAGO',
        readerId: 'r1',
        reader: { email: 'r@x.pt' },
        package: { name: 'Pacote' },
      });
      prisma.$transaction.mockResolvedValueOnce([]);

      await service.revoke('pur1', { id: 'u1', role: 'SUPER_ADMIN' });

      // Revocation is the DELETE — see PackagePurchaseItem for why it is
      // not a flag. The purchase row itself survives, so what happened
      // stays on the record.
      expect(prisma.packagePurchaseItem.deleteMany).toHaveBeenCalledWith({
        where: { purchaseId: 'pur1' },
      });
      expect(prisma.packagePurchase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'REEMBOLSADO' }),
        }),
      );
    });
  });

  describe('onChargeRefunded()', () => {
    it('records and warns, and never revokes on its own', async () => {
      prisma.packagePurchase.findFirst.mockResolvedValueOnce({
        id: 'pur1',
        readerId: 'r1',
        packageId: 'p1',
      });
      await service.onChargeRefunded(
        event({ id: 'evt_ref', type: 'charge.refunded' }),
        {
          id: 'ch_1',
          payment_intent: 'pi_1',
          metadata: { purchaseId: 'pur1' },
        } as unknown as Stripe.Charge,
      );
      // Partial refunds exist, and taking access away automatically is the
      // failure mode that generates the angriest support ticket. A person
      // decides, through revoke().
      expect(prisma.packagePurchaseItem.deleteMany).not.toHaveBeenCalled();
      expect(prisma.stripeEvent.create).toHaveBeenCalled();
    });
  });
});
