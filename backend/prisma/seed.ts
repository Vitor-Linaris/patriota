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

  // ── Editorial team (10 demo users) ───────────────────────────────
  const TEAM: { email: string; name: string; role: (typeof ROLE_ORDER)[number] }[] = [
    { email: 'editor.chefe@opatriota.pt', name: 'Rui Cardoso', role: 'EDITOR_CHEFE' },
    { email: 'editor1@opatriota.pt', name: 'Paulo Ferreira', role: 'EDITOR' },
    { email: 'editor2@opatriota.pt', name: 'Marta Sousa', role: 'EDITOR' },
    { email: 'jorn1@opatriota.pt', name: 'Ana Ferreira', role: 'JORNALISTA' },
    { email: 'jorn2@opatriota.pt', name: 'Carlos Neves', role: 'JORNALISTA' },
    { email: 'jorn3@opatriota.pt', name: 'Inês Rodrigues', role: 'JORNALISTA' },
    { email: 'revisor@opatriota.pt', name: 'Sofia Pinto', role: 'REVISOR' },
    { email: 'moderador@opatriota.pt', name: 'Ana Lopes', role: 'MODERADOR' },
    { email: 'analista@opatriota.pt', name: 'Beatriz Faria', role: 'ANALISTA' },
  ];
  const teamPasswordHash = await bcrypt.hash('Patriota2026!', 12);
  for (const t of TEAM) {
    await prisma.user.upsert({
      where: { email: t.email },
      update: { name: t.name, role: t.role, isActive: true },
      create: {
        email: t.email,
        name: t.name,
        role: t.role,
        password: teamPasswordHash,
        isActive: true,
      },
    });
  }

  // ── Articles ─────────────────────────────────────────────────────
  const existingArticles = await prisma.article.count();
  if (existingArticles < 30) {
    const categoryRows = await prisma.category.findMany();
    const authors = await prisma.user.findMany({
      where: { role: { in: ['EDITOR', 'EDITOR_CHEFE', 'JORNALISTA'] } },
    });

    const TITLES: Record<string, string[]> = {
      politica: [
        'Governo apresenta proposta de orçamento com aumento de 3,2%',
        'PS reage com críticas ao modelo de financiamento',
        'Chega anuncia voto contra orçamento sem negociação prévia',
        'Conselho de Ministros aprova pacote de medidas anti-corrupção',
        'Marcelo apela ao diálogo sobre nova lei do arrendamento',
      ],
      economia: [
        'Banco de Portugal revê projeção do PIB em alta para 2026',
        'Exportações atingem máximo histórico no primeiro trimestre',
        'FMI alerta para riscos da dívida pública europeia',
        'TAP regista lucro operacional pelo segundo trimestre',
        'Inflação desce para 2,1% em abril, abaixo das previsões',
      ],
      sociedade: [
        'Crise da habitação em Lisboa atinge novos máximos',
        'Greve dos professores paralisa escolas no Norte',
        'Estudo: portugueses trabalham mais que a média europeia',
        'Câmaras municipais reforçam apoio social no inverno',
      ],
      investigacao: [
        'Contratos públicos: auditoria revela irregularidades em 47 processos',
        'Máfia dos Seguros: como uma rede ilegal funciona à luz do dia',
        'O que dizem os contratos que o governo não quis mostrar',
      ],
      mundo: [
        'Cimeira europeia debate regras para plataformas digitais',
        'Brasil estreita laços comerciais com Portugal em nova visita',
        'Eleições nos EUA mantêm Senado dividido por margem mínima',
      ],
      tecnologia: [
        'IA na redacção: oportunidades e riscos para o jornalismo',
        'Startups portuguesas captam 300 milhões em ronda recorde',
        'Ciber-ataque a serviços públicos exige resposta coordenada',
      ],
      saude: [
        'SNS recebe reforço de 12% em financiamento hospitalar',
        'Listas de espera caem 18% em 12 meses no Norte',
      ],
      cultura: [
        'Festival NOS regressa ao Parque da Bela Vista em Julho',
        'Cinema português conquista prémio em Veneza',
      ],
      desporto: [
        'Sporting reage com cautela à proposta da Liga',
        'Atletismo: novos recordes nacionais em pista coberta',
      ],
    };

    for (const cat of categoryRows) {
      const slugTitles = TITLES[cat.slug] ?? [];
      for (let i = 0; i < slugTitles.length; i++) {
        const title = slugTitles[i];
        const slug = title
          .toLowerCase()
          .normalize('NFD')
          .replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/(^-|-$)/g, '')
          .slice(0, 80);
        const author = authors[(slugTitles.length * i) % authors.length] ?? authors[0];
        // 80% published, 10% draft, 10% scheduled
        const r = Math.random();
        const status =
          r < 0.8 ? 'PUBLICADO' : r < 0.9 ? 'RASCUNHO' : 'AGENDADO';
        const publishedAt =
          status === 'PUBLICADO'
            ? new Date(Date.now() - i * 3 * 3600_000)
            : null;
        await prisma.article.upsert({
          where: { slug },
          update: {},
          create: {
            slug,
            title,
            summary:
              'Análise dos desenvolvimentos mais recentes — leitura essencial para perceber o impacto na actualidade portuguesa.',
            content: `<p>${title}.</p><p>Análise em desenvolvimento. Equipa editorial do <strong>Patriota</strong> a acompanhar o tema com atualizações ao longo do dia.</p><p>Resumo: factos verificados, fontes oficiais e opinião especializada — o ponto de situação claro e objectivo.</p>`,
            status,
            categoryId: cat.id,
            authorId: author?.id ?? user.id,
            readMinutes: 3 + Math.floor(Math.random() * 7),
            views: status === 'PUBLICADO' ? Math.floor(Math.random() * 20000) : 0,
            publishedAt,
          },
        });
      }
    }
  }

  // ── Newsletter subscribers (sample) ───────────────────────────────
  const SUBS = [
    'maria.santos@gmail.com',
    'joao.ferreira@outlook.pt',
    'ana.costa@sapo.pt',
    'sofia.lopes@gmail.com',
    'tiago.rodrigues@sapo.pt',
  ];
  for (const email of SUBS) {
    await prisma.newsletterSubscriber.upsert({
      where: { email },
      update: {},
      create: {
        email,
        name: email.split('@')[0].replace('.', ' '),
        status: 'ATIVO',
        segment: 'Geral',
      },
    });
  }

  console.log('Seed complete.');
  console.log(`  Super Admin → ${user.email}`);
  if (!process.env.SUPERADMIN_PASSWORD) {
    console.log(`  Senha de desenvolvimento: ${password}`);
    console.log('  (defina SUPERADMIN_PASSWORD para sobrescrever)');
  }
  console.log('  Editorial team (password: Patriota2026!):');
  for (const t of TEAM) console.log(`    ${t.email} · ${t.role}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
