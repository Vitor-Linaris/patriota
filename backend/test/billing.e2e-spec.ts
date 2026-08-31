import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import Stripe from 'stripe';
import { createTestApp } from './helpers/app';
import { makeReader, readerBearer, type TestReader } from './helpers/reader';
import { makeUser } from './helpers/auth';
import { truncate } from './helpers/db';
import { PrismaService } from '../src/prisma/prisma.service';

const WEBHOOK_SECRET = 'whsec_test_secret_for_the_e2e_suite';
const DAY = 24 * 60 * 60 * 1000;

/**
 * Builds a signed webhook request the way Stripe would.
 *
 * `generateTestHeaderString` is Stripe's own helper and produces a real
 * signature over real bytes, so these tests exercise the actual
 * verification path rather than a stub of it. That matters: the
 * signature check is the ONLY authentication this endpoint has.
 */
function signed(payload: unknown): { body: string; signature: string } {
  const body = JSON.stringify(payload);
  const signature = Stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: WEBHOOK_SECRET,
  });
  return { body, signature };
}

let eventCounter = 0;
function evt(type: string, object: unknown, id?: string) {
  return {
    id: id ?? `evt_test_${++eventCounter}`,
    object: 'event',
    type,
    api_version: '2026-08-26.dahlia',
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    data: { object },
  };
}

/** A Stripe subscription, only the fields the handler reads. */
function subscription(over: {
  id?: string;
  customer: string;
  status: string;
  periodEnd?: number | null;
  readerId?: string;
}) {
  const end =
    over.periodEnd === undefined
      ? Math.floor((Date.now() + 30 * DAY) / 1000)
      : over.periodEnd;
  return {
    id: over.id ?? 'sub_test_1',
    object: 'subscription',
    customer: over.customer,
    status: over.status,
    metadata: over.readerId ? { readerId: over.readerId } : {},
    items: {
      object: 'list',
      data: [
        {
          id: 'si_test_1',
          object: 'subscription_item',
          ...(end === null ? {} : { current_period_end: end }),
        },
      ],
    },
  };
}

describe('Billing (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let reader: TestReader;

  beforeAll(async () => {
    process.env.FEATURE_READER_AREA = 'true';
    // A key is what switches billing on. Never a real one — nothing here
    // reaches the network; only the signature helper needs the secret.
    process.env.STRIPE_SECRET_KEY = 'sk_test_not_a_real_key';
    process.env.STRIPE_WEBHOOK_SECRET = WEBHOOK_SECRET;
    process.env.STRIPE_PRICE_ID = 'price_test_1';
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await truncate(app, ['Comment', 'Reader', 'Article', 'Category', 'User']);
    await prisma.stripeEvent.deleteMany({});
    await app.close();
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    delete process.env.STRIPE_PRICE_ID;
  });

  beforeEach(async () => {
    await truncate(app, ['Comment', 'Reader', 'Article', 'Category', 'User']);
    await prisma.stripeEvent.deleteMany({});
    reader = await makeReader(app);
  });

  const post = (payload: unknown, sig?: string) => {
    const { body, signature } = signed(payload);
    return request(app.getHttpServer())
      .post('/public/stripe/webhook')
      .set('stripe-signature', sig ?? signature)
      .set('Content-Type', 'application/json')
      .send(body);
  };

  const readerRow = () =>
    prisma.reader.findUnique({ where: { id: reader.id } });

  // ── the signature is the authentication ─────────────────────────────

  it('refuses an unsigned request', async () => {
    await request(app.getHttpServer())
      .post('/public/stripe/webhook')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(evt('customer.subscription.updated', {})))
      .expect(400);
  });

  it('refuses a wrongly-signed request', async () => {
    // Anyone who could forge this could hand themselves a subscription,
    // so it is the one check that has to hold with nothing behind it.
    const forged = Stripe.webhooks.generateTestHeaderString({
      payload: JSON.stringify(evt('customer.subscription.updated', {})),
      secret: 'whsec_the_wrong_secret',
    });
    await post(evt('customer.subscription.updated', {}), forged).expect(400);
  });

  it('refuses a body that was tampered with after signing', async () => {
    const payload = evt(
      'customer.subscription.updated',
      subscription({ customer: 'cus_1', status: 'active', readerId: reader.id }),
    );
    const { signature } = signed(payload);
    const tampered = JSON.stringify({ ...payload, id: 'evt_swapped' });

    await request(app.getHttpServer())
      .post('/public/stripe/webhook')
      .set('stripe-signature', signature)
      .set('Content-Type', 'application/json')
      .send(tampered)
      .expect(400);
  });

  // ── the happy path ──────────────────────────────────────────────────

  it('a completed checkout links the customer to the reader', async () => {
    await post(
      evt('checkout.session.completed', {
        id: 'cs_test_1',
        object: 'checkout.session',
        client_reference_id: reader.id,
        customer: 'cus_test_1',
        subscription: 'sub_test_1',
      }),
    ).expect(200);

    const row = await readerRow();
    expect(row!.stripeCustomerId).toBe('cus_test_1');
    expect(row!.stripeSubscriptionId).toBe('sub_test_1');
  });

  it('an active subscription grants the plan, with its end date', async () => {
    const end = Math.floor((Date.now() + 30 * DAY) / 1000);
    await post(
      evt(
        'customer.subscription.created',
        subscription({
          customer: 'cus_test_1',
          status: 'active',
          periodEnd: end,
          readerId: reader.id,
        }),
      ),
    ).expect(200);

    const row = await readerRow();
    expect(row!.plan).toBe('PREMIUM');
    expect(row!.planSource).toBe('STRIPE');
    expect(row!.planStatus).toBe('active');
    expect(row!.planRenewsAt!.getTime()).toBe(end * 1000);
    expect(row!.planStartedAt).not.toBeNull();
  });

  // ── the promise that costs money if broken ──────────────────────────

  it('a cancelled subscription keeps reading until the period already paid for', async () => {
    // RF6, and the reason planRenewsAt is "entitled until" rather than
    // "renews on". Cancelling in Stripe sets cancel_at_period_end and
    // leaves the status `active`, so the date does the work and nothing
    // has to run on the day it arrives.
    const end = Math.floor((Date.now() + 10 * DAY) / 1000);
    await post(
      evt(
        'customer.subscription.updated',
        {
          ...subscription({
            customer: 'cus_test_1',
            status: 'active',
            periodEnd: end,
            readerId: reader.id,
          }),
          cancel_at_period_end: true,
        },
      ),
    ).expect(200);

    const row = await readerRow();
    expect(row!.plan).toBe('PREMIUM');
    expect(row!.planRenewsAt!.getTime()).toBe(end * 1000);
  });

  it('a deleted subscription ends the plan but keeps the customer', async () => {
    await prisma.reader.update({
      where: { id: reader.id },
      data: {
        plan: 'PREMIUM',
        planSource: 'STRIPE',
        stripeCustomerId: 'cus_test_1',
        stripeSubscriptionId: 'sub_test_1',
      },
    });

    await post(
      evt(
        'customer.subscription.deleted',
        subscription({ customer: 'cus_test_1', status: 'canceled' }),
      ),
    ).expect(200);

    const row = await readerRow();
    expect(row!.plan).toBe('GRATIS');
    expect(row!.stripeSubscriptionId).toBeNull();
    // Same person, same invoice history — and a resubscription finds
    // them instead of creating a second customer.
    expect(row!.stripeCustomerId).toBe('cus_test_1');
  });

  it('a failed payment does not cut them off on the day it fails', async () => {
    // Stripe keeps retrying the card through past_due. Ending the plan
    // the moment one payment bounces turns a paying subscriber into an
    // angry ex-subscriber over a bank blip.
    const end = Math.floor((Date.now() + 5 * DAY) / 1000);
    await post(
      evt(
        'customer.subscription.updated',
        subscription({
          customer: 'cus_test_1',
          status: 'past_due',
          periodEnd: end,
          readerId: reader.id,
        }),
      ),
    ).expect(200);

    const row = await readerRow();
    expect(row!.plan).toBe('PREMIUM');
    expect(row!.planStatus).toBe('past_due');
  });

  it('but past_due past the period end does end it', async () => {
    await post(
      evt(
        'customer.subscription.updated',
        subscription({
          customer: 'cus_test_1',
          status: 'past_due',
          periodEnd: Math.floor((Date.now() - DAY) / 1000),
          readerId: reader.id,
        }),
      ),
    ).expect(200);

    expect((await readerRow())!.plan).toBe('GRATIS');
  });

  // ── idempotency ─────────────────────────────────────────────────────

  it('the same event twice does not extend the subscription twice', async () => {
    // Stripe delivers AT LEAST once and retries until it gets a 2xx, so
    // a repeat is routine rather than an anomaly. A duplicate that moved
    // the end date again would be invisible until somebody read their
    // invoices.
    const end = Math.floor((Date.now() + 30 * DAY) / 1000);
    const payload = evt(
      'customer.subscription.created',
      subscription({
        customer: 'cus_test_1',
        status: 'active',
        periodEnd: end,
        readerId: reader.id,
      }),
      'evt_duplicate_1',
    );

    const first = await post(payload).expect(200);
    expect(first.body.handled).toBe(true);

    // Between the two deliveries, move the date. If the retry acted
    // again it would overwrite this and the test would see the original.
    const moved = new Date(Date.now() + 99 * DAY);
    await prisma.reader.update({
      where: { id: reader.id },
      data: { planRenewsAt: moved },
    });

    const second = await post(payload).expect(200);
    // 200, not an error: a non-2xx makes Stripe retry for days.
    expect(second.body.handled).toBe(false);

    const row = await readerRow();
    expect(row!.planRenewsAt!.getTime()).toBe(moved.getTime());
    expect(await prisma.stripeEvent.count({ where: { id: 'evt_duplicate_1' } })).toBe(1);
  });

  it('records event types it does not act on, so a retry stays cheap', async () => {
    await post(evt('invoice.payment_succeeded', { id: 'in_1' }, 'evt_ignored_1')).expect(
      200,
    );
    const row = await prisma.stripeEvent.findUnique({
      where: { id: 'evt_ignored_1' },
    });
    expect(row).toBeTruthy();
    expect(row!.readerId).toBeNull();
  });

  it('an event for nobody is recorded and shrugged off', async () => {
    // A subscription created by hand in the Stripe dashboard for an
    // address that is not a reader. Answering 200 stops Stripe retrying
    // something that will never succeed.
    const res = await post(
      evt(
        'customer.subscription.updated',
        subscription({ customer: 'cus_unknown', status: 'active' }),
      ),
    ).expect(200);
    expect(res.body.handled).toBe(true);
  });

  // ── the whole point of any of this ──────────────────────────────────

  it('paying through Stripe opens the exclusive, and cancelling closes it', async () => {
    // End to end, through the same paywall a gifted subscription goes
    // through: nothing in articles.service.ts knows Stripe exists, it
    // only asks the plan permission table. This is what proves the two
    // ways of becoming a subscriber land in the same place.
    process.env.FEATURE_PAYWALL = 'true';
    const SECRET = 'SO PARA ASSINANTES';
    const cat = await prisma.category.create({
      data: {
        slug: 'sociedade',
        name: 'Sociedade',
        description: 'd',
        icon: '◆',
        color: '#1e40af',
        order: 1,
        visible: true,
        path: '/root/',
      },
    });
    const author = await makeUser(app, { role: 'EDITOR_CHEFE' });
    await prisma.article.create({
      data: {
        slug: 'exclusivo-pago',
        title: 'Exclusivo',
        summary: 's',
        content:
          '<p>Abertura visível a toda a gente, com texto que chega para encher a amostra.</p>'.repeat(
            20,
          ) + `<p>${SECRET}</p>`,
        status: 'PUBLICADO',
        exclusive: true,
        publishedAt: new Date(),
        categoryId: cat.id,
        authorId: author.id,
      },
    });

    const read = () =>
      request(app.getHttpServer())
        .get('/public/articles/by-slug/exclusivo-pago')
        .set(readerBearer(reader));

    // Before paying: the opening only.
    const before = await read().expect(200);
    expect(before.body.paywalled).toBe(true);

    await post(
      evt(
        'customer.subscription.created',
        subscription({
          customer: 'cus_test_1',
          status: 'active',
          readerId: reader.id,
        }),
      ),
    ).expect(200);

    const during = await read().expect(200);
    expect(during.body.content).toContain(SECRET);

    // Cancelled and the period already over — the date decides, with
    // nothing scheduled to make it happen.
    await post(
      evt(
        'customer.subscription.updated',
        subscription({
          customer: 'cus_test_1',
          status: 'active',
          periodEnd: Math.floor((Date.now() - DAY) / 1000),
          readerId: reader.id,
        }),
      ),
    ).expect(200);

    const after = await read().expect(200);
    expect(after.body.paywalled).toBe(true);
    expect(JSON.stringify(after.body)).not.toContain(SECRET);

    delete process.env.FEATURE_PAYWALL;
  });

  // ── the reader-facing routes ────────────────────────────────────────

  it('checkout and portal need a session', async () => {
    await request(app.getHttpServer())
      .post('/reader/billing/checkout')
      .expect(401);
    await request(app.getHttpServer())
      .post('/reader/billing/portal')
      .expect(401);
  });

  it('the portal refuses an account with no billing behind it', async () => {
    const res = await request(app.getHttpServer())
      .post('/reader/billing/portal')
      .set(readerBearer(reader))
      .expect(400);
    expect(res.body.message).toMatch(/faturação/i);
  });

  it('refuses a second checkout while one subscription is live', async () => {
    // Two checkouts means two cards charged for one thing.
    await prisma.reader.update({
      where: { id: reader.id },
      data: { plan: 'PREMIUM', planSource: 'STRIPE' },
    });
    const res = await request(app.getHttpServer())
      .post('/reader/billing/checkout')
      .set(readerBearer(reader))
      .expect(400);
    expect(res.body.message).toMatch(/já tem uma assinatura/i);
  });
});

describe('Billing disabled (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    process.env.FEATURE_READER_AREA = 'true';
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_WEBHOOK_SECRET;
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('the webhook answers plainly instead of failing', async () => {
    // A deployment with no keys is one that does not take money. Saying
    // so beats a 500 that Stripe would then retry for days.
    const res = await request(app.getHttpServer())
      .post('/public/stripe/webhook')
      .set('stripe-signature', 'irrelevante')
      .set('Content-Type', 'application/json')
      .send('{}')
      .expect(200);
    expect(res.body.ignored).toBeTruthy();
  });
});
