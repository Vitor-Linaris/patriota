import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser, bearer } from './helpers/auth';
import { truncate } from './helpers/db';
import { ActivityLogService } from '../src/activity-log/activity-log.service';

describe('ActivityLog (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncate(app, ['ActivityLog']);
  });

  it('GET /admin/activity rejects unauthenticated requests', async () => {
    await request(app.getHttpServer()).get('/admin/activity').expect(401);
  });

  it('GET /admin/activity returns paginated items for an authenticated admin', async () => {
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
    const service = app.get(ActivityLogService);

    await service.record({
      userId: admin.id,
      action: 'published',
      targetType: 'article',
      targetId: 'art-1',
      targetLabel: 'A test article',
    });

    const res = await request(app.getHttpServer())
      .get('/admin/activity')
      .set(bearer(admin))
      .expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({
      action: 'published',
      targetType: 'article',
      targetLabel: 'A test article',
      user: { id: admin.id },
    });
  });

  it('GET /admin/activity rejects roles without utilizadores.ver', async () => {
    const jorn = await makeUser(app, { role: 'JORNALISTA' });
    await request(app.getHttpServer())
      .get('/admin/activity')
      .set(bearer(jorn))
      .expect(403);
  });
});
