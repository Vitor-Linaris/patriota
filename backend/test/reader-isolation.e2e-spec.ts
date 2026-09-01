import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser, bearer, type TestUser } from './helpers/auth';
import { makeReader, readerBearer, type TestReader } from './helpers/reader';
import { truncate } from './helpers/db';

/**
 * The spec that matters most in the reader area.
 *
 * Staff (`User`, RBAC, /admin) and readers (`Reader`, public) are two
 * separate audiences that happen to share one API process. Four things
 * keep them apart — distinct signing key, `typ` claim, distinct table
 * lookup, distinct request property — and this file asserts that any one
 * of them being removed shows up as a failing test rather than as a
 * privilege escalation in production.
 *
 * If you are here because a test failed: do not "fix" it by relaxing an
 * expectation. A 200 anywhere below is a cross-audience auth bypass.
 */
describe('Reader / staff session isolation (e2e)', () => {
  let app: INestApplication;
  let staff: TestUser;
  let reader: TestReader;

  /** Routes that must only ever answer to a staff token. */
  const STAFF_ROUTES = [
    '/auth/me',
    '/admin/categories',
    '/admin/articles',
    '/admin/users',
    '/admin/settings',
  ];

  /** Routes that must only ever answer to a reader token. */
  const READER_ROUTES = ['/reader/me'];

  beforeAll(async () => {
    // The reader routes 404 rather than 401 while the flag is off, which
    // would mask a real bypass. Turn it on for this spec explicitly.
    process.env.FEATURE_READER_AREA = 'true';
    app = await createTestApp();
    staff = await makeUser(app, { role: 'SUPER_ADMIN' });
    reader = await makeReader(app);
  });

  afterAll(async () => {
    await truncate(app, ['Reader', 'User']);
    await app.close();
  });

  describe('a reader token cannot reach staff routes', () => {
    it.each(STAFF_ROUTES)('401 on GET %s', async (route) => {
      await request(app.getHttpServer())
        .get(route)
        .set(readerBearer(reader))
        .expect(401);
    });
  });

  describe('a staff token cannot reach reader routes', () => {
    it.each(READER_ROUTES)('401 on GET %s', async (route) => {
      await request(app.getHttpServer())
        .get(route)
        .set(bearer(staff))
        .expect(401);
    });
  });

  it('each audience still reaches its own routes', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set(bearer(staff))
      .expect(200);

    await request(app.getHttpServer())
      .get('/reader/me')
      .set(readerBearer(reader))
      .expect(200);
  });

  it('rejects a reader payload signed with the STAFF secret', async () => {
    // The exact forgery the second secret exists to stop: correct shape,
    // correct claims, wrong key.
    const jwt = app.get(JwtService);
    const config = app.get(ConfigService);
    const forged = await jwt.signAsync(
      { sub: reader.id, typ: 'reader', tv: 0 },
      { secret: config.get<string>('JWT_SECRET')! },
    );

    await request(app.getHttpServer())
      .get('/reader/me')
      .set({ Authorization: `Bearer ${forged}` })
      .expect(401);
  });

  it('rejects a staff-typed token on a reader route even with the right key', async () => {
    const jwt = app.get(JwtService);
    const config = app.get(ConfigService);
    const wrongAudience = await jwt.signAsync(
      { sub: reader.id, typ: 'staff', tv: 0 },
      { secret: config.get<string>('READER_JWT_SECRET')! },
    );

    await request(app.getHttpServer())
      .get('/reader/me')
      .set({ Authorization: `Bearer ${wrongAudience}` })
      .expect(401);
  });

  it('rejects a reader-typed token on a staff route even with the right key', async () => {
    const jwt = app.get(JwtService);
    const config = app.get(ConfigService);
    const wrongAudience = await jwt.signAsync(
      { sub: staff.id, email: staff.email, role: staff.role, typ: 'reader' },
      { secret: config.get<string>('JWT_SECRET')! },
    );

    await request(app.getHttpServer())
      .get('/auth/me')
      .set({ Authorization: `Bearer ${wrongAudience}` })
      .expect(401);
  });

  it('rejects a staff token with no audience claim at all', async () => {
    // The shape every staff token had before M10. Tolerated for one
    // release so live sessions survived the rollout; refused now, which
    // is what closes the gap for good.
    const jwt = app.get(JwtService);
    const config = app.get(ConfigService);
    const unstamped = await jwt.signAsync(
      { sub: staff.id, email: staff.email, role: staff.role },
      { secret: config.get<string>('JWT_SECRET')! },
    );

    await request(app.getHttpServer())
      .get('/auth/me')
      .set({ Authorization: `Bearer ${unstamped}` })
      .expect(401);
  });

  it('rejects a reader token whose tokenVersion is stale', async () => {
    // What a password change or "terminar todas as sessões" produces.
    const jwt = app.get(JwtService);
    const config = app.get(ConfigService);
    const stale = await jwt.signAsync(
      { sub: reader.id, typ: 'reader', tv: 99 },
      { secret: config.get<string>('READER_JWT_SECRET')! },
    );

    await request(app.getHttpServer())
      .get('/reader/me')
      .set({ Authorization: `Bearer ${stale}` })
      .expect(401);
  });

  it('rejects an anonymous request to a reader route', async () => {
    await request(app.getHttpServer()).get('/reader/me').expect(401);
  });

  it('refuses a suspended reader holding an otherwise valid token', async () => {
    // 403 rather than the 401 a stale or forged token gets: the signature
    // is good and the account is real, so "sessão inválida" would be a
    // lie — and the one that sends a banned reader to support instead of
    // telling them they are banned.
    const suspended = await makeReader(app, { status: 'SUSPENSO' });
    const res = await request(app.getHttpServer())
      .get('/reader/me')
      .set(readerBearer(suspended))
      .expect(403);
    expect(res.body.message).toMatch(/suspensa/i);
  });
});

/**
 * The server-side kill switch. NEXT_PUBLIC_FEATURE_* lives in the browser
 * bundle and stops nobody from calling :8585 directly, so the backend flag
 * is what actually closes the feature.
 */
describe('Reader area feature flag (e2e)', () => {
  let app: INestApplication;
  let reader: TestReader;

  beforeAll(async () => {
    process.env.FEATURE_READER_AREA = 'true';
    app = await createTestApp();
    reader = await makeReader(app);
  });

  afterAll(async () => {
    process.env.FEATURE_READER_AREA = 'true';
    await truncate(app, ['Reader']);
    await app.close();
  });

  it('404s reader routes when the flag is off, even with a valid token', async () => {
    process.env.FEATURE_READER_AREA = 'false';
    await request(app.getHttpServer())
      .get('/reader/me')
      .set(readerBearer(reader))
      .expect(404);

    await request(app.getHttpServer())
      .post('/public/reader/login')
      .send({ email: reader.email, password: 'TestReader123!' })
      .expect(404);
  });

  it('serves them again when the flag is on', async () => {
    process.env.FEATURE_READER_AREA = 'true';
    await request(app.getHttpServer())
      .get('/reader/me')
      .set(readerBearer(reader))
      .expect(200);
  });
});
