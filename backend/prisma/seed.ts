/**
 * Prisma seed — bootstraps a superadmin user and the RBAC matrix.
 *
 * Run from inside the api container:
 *   docker compose exec api npx prisma db seed
 *
 * Or from the host (with DATABASE_URL pointing at localhost:5432):
 *   npm run prisma:seed
 *
 * Credentials are read from env vars (with safe-ish defaults for local dev).
 * Change SUPERADMIN_PASSWORD before any non-local use.
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/prisma/client';

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

const ROLE_ORDER = [
  'SUPER_ADMIN',
  'EDITOR_CHEFE',
  'EDITOR',
  'JORNALISTA',
  'REVISOR',
  'MODERADOR',
  'ANALISTA',
] as const;

const ALL_PERMISSIONS = [
  'artigos.ler', 'artigos.criar', 'artigos.editar_proprios', 'artigos.editar_todos',
  'artigos.publicar', 'artigos.despublicar', 'artigos.eliminar', 'artigos.arquivar',
  'categorias.ver', 'categorias.criar', 'categorias.editar', 'categorias.eliminar',
  'utilizadores.ver', 'utilizadores.criar', 'utilizadores.editar',
  'utilizadores.suspender', 'utilizadores.atribuir_roles',
  'comentarios.ver', 'comentarios.aprovar', 'comentarios.eliminar',
  'media.carregar', 'media.editar_metadados', 'media.eliminar',
  'analytics.basicas', 'analytics.avancadas', 'analytics.exportar',
  'newsletter.listas', 'newsletter.enviar',
  'configuracoes.aceder', 'configuracoes.editar', 'configuracoes.permissoes',
];

const DEFAULTS: Record<(typeof ROLE_ORDER)[number], string[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],
  EDITOR_CHEFE: ALL_PERMISSIONS.filter((p) => p !== 'configuracoes.permissoes'),
  EDITOR: [
    'artigos.ler', 'artigos.criar', 'artigos.editar_proprios', 'artigos.editar_todos',
    'artigos.publicar', 'artigos.despublicar', 'artigos.arquivar',
    'categorias.ver', 'categorias.criar', 'categorias.editar',
    'comentarios.ver', 'comentarios.aprovar',
    'media.carregar', 'media.editar_metadados',
    'analytics.basicas',
  ],
  JORNALISTA: [
    'artigos.ler', 'artigos.criar', 'artigos.editar_proprios',
    'categorias.ver',
    'media.carregar',
  ],
  REVISOR: [
    'artigos.ler', 'artigos.editar_proprios',
    'comentarios.ver', 'comentarios.aprovar',
  ],
  MODERADOR: [
    'comentarios.ver', 'comentarios.aprovar', 'comentarios.eliminar',
    'utilizadores.ver', 'utilizadores.suspender',
  ],
  ANALISTA: [
    'analytics.basicas', 'analytics.avancadas', 'analytics.exportar',
    'artigos.ler',
  ],
};

async function main() {
  const email = (process.env.SUPERADMIN_EMAIL ?? 'admin@opatriota.pt').toLowerCase();
  const password = process.env.SUPERADMIN_PASSWORD ?? 'PatriotaAdmin!2025';
  const name = process.env.SUPERADMIN_NAME ?? 'Super Admin';

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { role: 'SUPER_ADMIN', isActive: true, name },
    create: {
      email,
      name,
      password: passwordHash,
      role: 'SUPER_ADMIN',
      isActive: true,
    },
  });

  for (const role of ROLE_ORDER) {
    await prisma.rolePermissions.upsert({
      where: { role },
      update: {},
      create: { role, permissions: DEFAULTS[role] },
    });
  }

  // Default editorial categories — idempotent via upsert by slug
  const CATEGORIES = [
    { slug: 'politica', name: 'Política', description: 'Parlamento, governo, partidos e eleições em Portugal.', icon: '◆', color: '#1e40af', order: 1, subtopics: ['Orçamento 2026', 'Parlamento', 'Governo', 'Partidos', 'Eleições', 'Diplomacia'] },
    { slug: 'economia', name: 'Economia', description: 'Análise económica, mercados, empresas e finanças públicas.', icon: '◈', color: '#065f46', order: 2, subtopics: ['Mercados', 'Empresas', 'Habitação', 'Turismo', 'Trabalho'] },
    { slug: 'sociedade', name: 'Sociedade', description: 'Habitação, trabalho, saúde e os temas do dia a dia.', icon: '◎', color: '#7c3aed', order: 3, subtopics: ['Educação', 'Saúde', 'Ambiente', 'Imigração'] },
    { slug: 'investigacao', name: 'Investigação', description: 'Jornalismo de investigação e dados em profundidade.', icon: '◉', color: '#991b1b', order: 4, subtopics: ['Corrupção', 'Justiça', 'Contratos públicos'] },
    { slug: 'mundo', name: 'Mundo', description: 'Política internacional, conflitos e diplomacia global.', icon: '◇', color: '#0e7490', order: 5, subtopics: ['Europa', 'EUA', 'Brasil', 'Conflitos'] },
    { slug: 'tecnologia', name: 'Tecnologia', description: 'IA, startups, regulação digital e telecomunicações.', icon: '▣', color: '#0891b2', order: 6, subtopics: ['IA', 'Startups', 'Cibersegurança'] },
    { slug: 'saude', name: 'Saúde', description: 'SNS, doenças, prevenção e políticas de saúde.', icon: '◑', color: '#059669', order: 7, subtopics: ['SNS', 'Medicamentos', 'Saúde Mental'] },
    { slug: 'cultura', name: 'Cultura', description: 'Livros, cinema, música e espetáculos.', icon: '◈', color: '#b45309', order: 8, subtopics: ['Cinema', 'Literatura', 'Música', 'Teatro'] },
    { slug: 'desporto', name: 'Desporto', description: 'Futebol, modalidades e cobertura olímpica.', icon: '◎', color: '#dc2626', order: 9, subtopics: ['Futebol', 'Modalidades', 'Olimpíadas'] },
  ];

  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, description: c.description, icon: c.icon, color: c.color, order: c.order },
      create: {
        slug: c.slug,
        name: c.name,
        description: c.description,
        icon: c.icon,
        color: c.color,
        order: c.order,
        visible: true,
      },
    });
    // Only seed subtopics if the category has none yet
    const existing = await prisma.subtopic.count({ where: { categoryId: cat.id } });
    if (existing === 0) {
      await prisma.subtopic.createMany({
        data: c.subtopics.map((label, i) => ({
          categoryId: cat.id,
          label,
          order: i,
        })),
      });
    }
  }

  console.log('Seed complete.');
  console.log(`  Super Admin → ${user.email}`);
  if (!process.env.SUPERADMIN_PASSWORD) {
    console.log(`  Senha de desenvolvimento: ${password}`);
    console.log('  (defina SUPERADMIN_PASSWORD para sobrescrever)');
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
