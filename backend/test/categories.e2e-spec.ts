import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/app';
import { makeUser, bearer, type TestUser } from './helpers/auth';
import { truncate } from './helpers/db';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Categories (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await truncate(app, ['Article', 'Category', 'User']);
  });

  it('rejects POST /admin/categories without authentication', async () => {
    await request(app.getHttpServer())
      .post('/admin/categories')
      .send({
        name: 'X',
        description: 'd',
        icon: '◆',
        color: '#000',
      })
      .expect(401);
  });

  it('admin can create, update, list and delete categories', async () => {
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });

    // Create
    const created = await request(app.getHttpServer())
      .post('/admin/categories')
      .set(bearer(admin))
      .send({
        name: 'Política',
        description: 'Cobertura política',
        icon: '◆',
        color: '#1e40af',
      })
      .expect(201);
    expect(created.body.slug).toBe('politica');

    // List
    const list = await request(app.getHttpServer())
      .get('/admin/categories')
      .set(bearer(admin))
      .expect(200);
    expect(list.body).toHaveLength(1);

    // Update
    await request(app.getHttpServer())
      .patch(`/admin/categories/${created.body.id}`)
      .set(bearer(admin))
      .send({ description: 'Atualizada' })
      .expect(200);

    // Add subtopic
    const sub = await request(app.getHttpServer())
      .post(`/admin/categories/${created.body.id}/subtopics`)
      .set(bearer(admin))
      .send({ label: 'Parlamento' })
      .expect(201);
    expect(sub.body.label).toBe('Parlamento');

    // Public list should include it
    const pub = await request(app.getHttpServer())
      .get('/public/categories')
      .expect(200);
    expect(pub.body[0].subtopics).toHaveLength(1);

    // The subtopic is now a real depth-1 Category child (parentId is
    // onDelete: Restrict), so the parent refuses to delete while it
    // exists — the same protection remove() gives a category with
    // articles, extended to children.
    await request(app.getHttpServer())
      .delete(`/admin/categories/${created.body.id}`)
      .set(bearer(admin))
      .expect(409);

    // Removing the child first clears the way.
    await request(app.getHttpServer())
      .delete(`/admin/categories/${created.body.id}/subtopics/${sub.body.id}`)
      .set(bearer(admin))
      .expect(200);

    await request(app.getHttpServer())
      .delete(`/admin/categories/${created.body.id}`)
      .set(bearer(admin))
      .expect(200);
  });

  it('public /public/categories does not require authentication', async () => {
    await request(app.getHttpServer()).get('/public/categories').expect(200);
  });

  it('rejects duplicate slugs with 409', async () => {
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
    const body = {
      name: 'Cultura',
      slug: 'cultura',
      description: '',
      icon: '◆',
      color: '#000000',
    };
    await request(app.getHttpServer())
      .post('/admin/categories')
      .set(bearer(admin))
      .send(body)
      .expect(201);
    await request(app.getHttpServer())
      .post('/admin/categories')
      .set(bearer(admin))
      .send(body)
      .expect(409);
  });

  it('roles without categorias.eliminar cannot delete', async () => {
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
    const jorn = await makeUser(app, { role: 'JORNALISTA' });

    const created = await request(app.getHttpServer())
      .post('/admin/categories')
      .set(bearer(admin))
      .send({ name: 'Test', description: '', icon: '◆', color: '#000000' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/admin/categories/${created.body.id}`)
      .set(bearer(jorn))
      .expect(403);
  });

  describe('hierarchy', () => {
    /**
     * Against the real database on purpose: moveTo() rewrites the whole
     * subtree with one $executeRaw, and the unit tests mock that call
     * away. The path/depth arithmetic below is the part that can only
     * be proven here.
     */
    const mk = (
      admin: TestUser,
      body: Record<string, unknown>,
    ) =>
      request(app.getHttpServer())
        .post('/admin/categories')
        .set(bearer(admin))
        .send({ description: '', icon: '◆', color: '#000000', ...body });

    async function makeChain(admin: TestUser) {
      const pt = await mk(admin, { name: 'Portugal' }).expect(201);
      const ma = await mk(admin, { name: 'Madeira', parentId: pt.body.id }).expect(201);
      const fu = await mk(admin, { name: 'Funchal', parentId: ma.body.id }).expect(201);
      const se = await mk(admin, { name: 'Sé', parentId: fu.body.id }).expect(201);
      return { pt: pt.body, ma: ma.body, fu: fu.body, se: se.body };
    }

    it('builds a four-level chain with coherent path and depth', async () => {
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      const { pt, ma, fu, se } = await makeChain(admin);

      expect(pt.depth).toBe(0);
      expect(pt.path).toBe(`/${pt.id}/`);
      expect(se.depth).toBe(3);
      expect(se.path).toBe(`/${pt.id}/${ma.id}/${fu.id}/${se.id}/`);
    });

    it('refuses a fifth level', async () => {
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      const { se } = await makeChain(admin);

      await mk(admin, { name: 'Rua Direita', parentId: se.id }).expect(400);
    });

    it('GET /admin/categories/tree nests the whole forest', async () => {
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      await makeChain(admin);

      const res = await request(app.getHttpServer())
        .get('/admin/categories/tree')
        .set(bearer(admin))
        .expect(200);

      expect(res.body).toHaveLength(1);
      expect(res.body[0].name).toBe('Portugal');
      expect(res.body[0].children[0].children[0].children[0].name).toBe('Sé');
    });

    it('moving a branch rewrites path and depth for every descendant', async () => {
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      const prisma = app.get(PrismaService);
      const { pt, ma, fu, se } = await makeChain(admin);

      // Promote Madeira (and Funchal -> Sé with it) to a root.
      await request(app.getHttpServer())
        .patch(`/admin/categories/${ma.id}`)
        .set(bearer(admin))
        .send({ parentId: null })
        .expect(200);

      const rows = await prisma.category.findMany({
        where: { id: { in: [ma.id, fu.id, se.id] } },
        select: { id: true, depth: true, path: true, parentId: true },
      });
      const byId = Object.fromEntries(rows.map((r) => [r.id, r]));

      expect(byId[ma.id]).toMatchObject({ depth: 0, parentId: null, path: `/${ma.id}/` });
      // The two descendants moved up a level each, in the same statement.
      expect(byId[fu.id]).toMatchObject({ depth: 1, path: `/${ma.id}/${fu.id}/` });
      expect(byId[se.id]).toMatchObject({ depth: 2, path: `/${ma.id}/${fu.id}/${se.id}/` });
      // And Portugal was left untouched.
      expect(
        await prisma.category.findUnique({ where: { id: pt.id }, select: { depth: true } }),
      ).toMatchObject({ depth: 0 });
    });

    it('refuses to move a node into its own descendant, with 400', async () => {
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      const prisma = app.get(PrismaService);
      const { fu, se } = await makeChain(admin);

      await request(app.getHttpServer())
        .patch(`/admin/categories/${fu.id}`)
        .set(bearer(admin))
        .send({ parentId: se.id })
        .expect(400);

      // The tree is unchanged — no half-applied move.
      expect(
        await prisma.category.findUnique({
          where: { id: fu.id },
          select: { depth: true },
        }),
      ).toMatchObject({ depth: 2 });
    });

    it('refuses a move that would push the subtree past four levels', async () => {
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      const { ma, fu } = await makeChain(admin);

      // Madeira alone would fit under Funchal, but it drags Funchal -> Sé
      // along, so the deepest leaf would land at level 5+.
      await request(app.getHttpServer())
        .patch(`/admin/categories/${ma.id}`)
        .set(bearer(admin))
        .send({ parentId: fu.id })
        .expect(400);
    });

    describe('POST /admin/categories/reorder', () => {
      const reorder = (admin: TestUser, body: Record<string, unknown>) =>
        request(app.getHttpServer())
          .post('/admin/categories/reorder')
          .set(bearer(admin))
          .send(body);

      /** Three roots at order 0/1/2. Names are >= 2 chars, per the DTO. */
      async function threeRoots(admin: TestUser) {
        const a = await mk(admin, { name: 'Alfa' }).expect(201);
        const b = await mk(admin, { name: 'Bravo' }).expect(201);
        const c = await mk(admin, { name: 'Charlie' }).expect(201);
        // create() defaults order to 0 for all three, so settle them.
        for (const [i, r] of [a, b, c].entries()) {
          await reorder(admin, { id: r.body.id, parentId: null, index: i }).expect(201);
        }
        return { a: a.body, b: b.body, c: c.body };
      }

      const orderOf = async (ids: string[]) => {
        const prisma = app.get(PrismaService);
        const rows = await prisma.category.findMany({
          where: { id: { in: ids } },
          select: { id: true, order: true },
        });
        return Object.fromEntries(rows.map((r) => [r.id, r.order]));
      };

      it('reorders siblings densely, from 0', async () => {
        const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
        const { a, b, c } = await threeRoots(admin);

        // Drag C to the front.
        await reorder(admin, { id: c.id, parentId: null, index: 0 }).expect(201);

        expect(await orderOf([a.id, b.id, c.id])).toEqual({
          [c.id]: 0,
          [a.id]: 1,
          [b.id]: 2,
        });
      });

      it('closes the gap in the origin when a node changes parent', async () => {
        const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
        const { a, b, c } = await threeRoots(admin);

        // Move B (order 1) under A. The remaining roots must become 0,1
        // with no hole where B was.
        await reorder(admin, { id: b.id, parentId: a.id, index: 0 }).expect(201);

        expect(await orderOf([a.id, c.id])).toEqual({ [a.id]: 0, [c.id]: 1 });
        expect(await orderOf([b.id])).toEqual({ [b.id]: 0 });
      });

      it('reparents and rewrites the subtree in one call', async () => {
        const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
        const prisma = app.get(PrismaService);
        const { ma, fu, se } = await makeChain(admin);

        await reorder(admin, { id: ma.id, parentId: null, index: 0 }).expect(201);

        const rows = await prisma.category.findMany({
          where: { id: { in: [ma.id, fu.id, se.id] } },
          select: { id: true, depth: true, path: true },
        });
        const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
        expect(byId[ma.id].depth).toBe(0);
        expect(byId[se.id].depth).toBe(2);
        expect(byId[se.id].path).toBe(`/${ma.id}/${fu.id}/${se.id}/`);
      });

      it('clamps an index past the end instead of failing', async () => {
        const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
        const { a, b, c } = await threeRoots(admin);

        await reorder(admin, { id: a.id, parentId: null, index: 99 }).expect(201);

        expect(await orderOf([a.id, b.id, c.id])).toEqual({
          [b.id]: 0,
          [c.id]: 1,
          [a.id]: 2,
        });
      });

      it('refuses a drop inside the node’s own descendant, with 400', async () => {
        const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
        const prisma = app.get(PrismaService);
        const { fu, se } = await makeChain(admin);

        await reorder(admin, { id: fu.id, parentId: se.id, index: 0 }).expect(400);

        // Nothing half-applied: the transaction rolled the move back.
        expect(
          await prisma.category.findUnique({
            where: { id: se.id },
            select: { depth: true, parentId: true },
          }),
        ).toMatchObject({ depth: 3, parentId: fu.id });
      });

      it('refuses a drop that would exceed four levels', async () => {
        const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
        const { ma, fu } = await makeChain(admin);

        await reorder(admin, { id: ma.id, parentId: fu.id, index: 0 }).expect(400);
      });

      it('404s for an unknown node', async () => {
        const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
        await reorder(admin, { id: 'nao-existe', parentId: null, index: 0 }).expect(404);
      });

      it('requires categorias.editar', async () => {
        const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
        const jorn = await makeUser(app, { role: 'JORNALISTA' });
        const { a } = await threeRoots(admin);

        await reorder(jorn, { id: a.id, parentId: null, index: 0 }).expect(403);
      });

      it('rejects a payload with no parentId key at all', async () => {
        // Absent must not be silently read as "move to root" — that would
        // turn a malformed request into a destructive one.
        const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
        const { a } = await threeRoots(admin);

        await reorder(admin, { id: a.id, index: 0 }).expect(400);
      });
    });

    it('a plain field edit does not disturb the hierarchy', async () => {
      const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
      const prisma = app.get(PrismaService);
      const { fu, se } = await makeChain(admin);

      await request(app.getHttpServer())
        .patch(`/admin/categories/${fu.id}`)
        .set(bearer(admin))
        .send({ description: 'Capital da Madeira' })
        .expect(200);

      expect(
        await prisma.category.findUnique({
          where: { id: se.id },
          select: { depth: true, parentId: true },
        }),
      ).toMatchObject({ depth: 3, parentId: fu.id });
    });
  });

  it('refuses to delete a category with articles, with 409 not 500', async () => {
    // Against the real database, which is where this mattered:
    // Article.category has no onDelete, so Postgres raises a
    // foreign-key violation. Before this guard it escaped as a 500.
    const admin = await makeUser(app, { role: 'SUPER_ADMIN' });
    const prisma = app.get(PrismaService);

    const created = await request(app.getHttpServer())
      .post('/admin/categories')
      .set(bearer(admin))
      .send({ name: 'Com artigos', description: '', icon: '◆', color: '#000000' })
      .expect(201);

    await prisma.article.create({
      data: {
        slug: 'artigo-a-bloquear',
        title: 'Artigo a bloquear',
        summary: 's',
        content: 'c',
        status: 'PUBLICADO',
        publishedAt: new Date(),
        categoryId: created.body.id,
        authorId: admin.id,
      },
    });

    const res = await request(app.getHttpServer())
      .delete(`/admin/categories/${created.body.id}`)
      .set(bearer(admin))
      .expect(409);

    // The editor is told what is in the way, not just refused.
    expect(res.body.message).toMatch(/Com artigos/);
    expect(res.body.message).toMatch(/1 artigo associado/);

    // And the category is still there.
    expect(
      await prisma.category.findUnique({ where: { id: created.body.id } }),
    ).not.toBeNull();
  });
});
