/**
 * Prisma seed — DEVELOPMENT ONLY.
 *
 * Bootstraps a superadmin, the full RBAC matrix, demo users, demo
 * articles and demo newsletter subscribers. Suitable for local dev
 * because it lets you click around immediately after `compose up`.
 *
 * In production the first SUPER_ADMIN is created automatically by
 * `src/bootstrap-admin.ts` on the very first boot (with a triple
 * guard that closes the bootstrap window after first use). DO NOT
 * run this seed against a production database — it would reinstate
 * the 9 demo users with the publicly-known dev password and reset
 * customised categories back to their defaults.
 *
 * This file refuses to run when NODE_ENV=production (see the guard
 * below) — defence in depth against an intern doing
 *   `docker compose exec api npx prisma db seed`
 * in prod by accident.
 *
 * Run locally:
 *   docker compose exec api npx prisma db seed
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '../generated/prisma/client';

// Defence-in-depth guard — refuse to run in production no matter
// who or what invoked us. The `--force` escape hatch is intentional:
// if you really need to seed a fresh staging DB that happens to have
// NODE_ENV=production set, you have to be very explicit about it.
if (process.env.NODE_ENV === 'production' && !process.argv.includes('--force')) {
  console.error(
    '\n[seed] Refusing to run with NODE_ENV=production.\n' +
      '       The bootstrap of the initial admin is handled automatically\n' +
      '       on first boot — see backend/src/bootstrap-admin.ts.\n' +
      '       If you REALLY want to seed in production (you almost\n' +
      '       certainly do not), pass --force.\n',
  );
  process.exit(1);
}

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

  // Default editorial categories — idempotent via upsert by slug.
  // `order` controls the left-to-right order in the public top menu.
  //
  // `children` used to seed a separate, purely decorative Subtopic
  // model (nothing filtered by it, Article had no subtopicId). The
  // category_hierarchy migration absorbed those rows into real depth-1
  // Category nodes, so this seed now upserts them the same way —
  // clickable sections instead of dead label chips.
  const CATEGORIES = [
    { slug: 'portugal', name: 'Portugal', description: 'O país hoje: política, sociedade e regiões.', icon: '◆', color: '#dc2626', order: 1, children: ['Norte', 'Centro', 'Lisboa', 'Sul', 'Ilhas'] },
    { slug: 'politica', name: 'Política', description: 'Parlamento, governo, partidos e eleições em Portugal.', icon: '◆', color: '#1e40af', order: 2, children: ['Orçamento 2026', 'Parlamento', 'Governo', 'Partidos', 'Eleições', 'Diplomacia'] },
    { slug: 'economia', name: 'Economia', description: 'Análise económica, mercados, empresas e finanças públicas.', icon: '◈', color: '#065f46', order: 3, children: ['Mercados', 'Empresas', 'Habitação', 'Turismo', 'Trabalho'] },
    { slug: 'sociedade', name: 'Sociedade', description: 'Habitação, trabalho, saúde e os temas do dia a dia.', icon: '◎', color: '#7c3aed', order: 4, children: ['Educação', 'Saúde', 'Ambiente', 'Imigração'] },
    { slug: 'investigacao', name: 'Investigação', description: 'Jornalismo de investigação e dados em profundidade.', icon: '◉', color: '#991b1b', order: 5, children: ['Corrupção', 'Justiça', 'Contratos públicos'] },
    { slug: 'mundo', name: 'Mundo', description: 'Política internacional, conflitos e diplomacia global.', icon: '◇', color: '#0e7490', order: 6, children: ['Europa', 'EUA', 'Brasil', 'Conflitos'] },
    { slug: 'tecnologia', name: 'Tecnologia', description: 'IA, startups, regulação digital e telecomunicações.', icon: '▣', color: '#0891b2', order: 7, children: ['IA', 'Startups', 'Cibersegurança'] },
    { slug: 'saude', name: 'Saúde', description: 'SNS, doenças, prevenção e políticas de saúde.', icon: '◑', color: '#059669', order: 8, children: ['SNS', 'Medicamentos', 'Saúde Mental'] },
    { slug: 'cultura', name: 'Cultura', description: 'Livros, cinema, música e espetáculos.', icon: '◈', color: '#b45309', order: 9, children: ['Cinema', 'Literatura', 'Música', 'Teatro'] },
    { slug: 'desporto', name: 'Desporto', description: 'Futebol, modalidades e cobertura olímpica.', icon: '◎', color: '#dc2626', order: 10, children: ['Futebol', 'Modalidades', 'Olimpíadas'] },
    { slug: 'multimedia', name: 'Multimédia', description: 'Reportagens em vídeo, podcasts e galerias.', icon: '▶', color: '#7c2d12', order: 11, children: ['Vídeo', 'Podcast', 'Fotorreportagem'] },
    { slug: 'opiniao', name: 'Opinião', description: 'Análise, colunas e editoriais.', icon: '◌', color: '#4b5563', order: 12, children: ['Editorial', 'Convidados', 'Colunistas'] },
  ];

  /** Matches CategoriesService's slugify + parent-suffix disambiguation. */
  function seedSlug(label: string, parentSlug: string): string {
    const base = label
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
    return `${base}-${parentSlug}`;
  }

  type CategoryRow = Awaited<ReturnType<typeof prisma.category.findFirstOrThrow>>;

  /** Fills in the real self-inclusive path once the row's id is known. */
  async function finalisePath(
    row: CategoryRow,
    parentPath: string | undefined,
  ): Promise<CategoryRow> {
    if (row.path !== '/pending/') return row;
    const path = `${parentPath ?? '/'}${row.id}/`;
    return prisma.category.update({ where: { id: row.id }, data: { path } });
  }

  /** Roots are, and always were, keyed by slug — this part is unchanged. */
  async function upsertRoot(input: {
    slug: string;
    name: string;
    description: string;
    icon: string;
    color: string;
    order: number;
  }): Promise<CategoryRow> {
    const row = await prisma.category.upsert({
      where: { slug: input.slug },
      update: { name: input.name, order: input.order },
      create: {
        slug: input.slug,
        name: input.name,
        description: input.description,
        icon: input.icon,
        color: input.color,
        order: input.order,
        visible: true,
        depth: 0,
        path: '/pending/',
      },
    });
    return finalisePath(row, undefined);
  }

  /**
   * Children are matched by (parentId, name), NOT by a freshly computed
   * slug.
   *
   * The category_hierarchy migration already absorbed the real Subtopic
   * rows into Category children, using label + a fragment of the row's
   * OWN id as the slug (it had to disambiguate without knowing what this
   * seed would ever choose). This seed's own slug scheme is label +
   * parent SLUG. On any database where the migration ran against real
   * data, those two schemes produce different slugs for what is
   * semantically the same node — matching on slug would create a
   * duplicate every single time this seed runs. Matching on the parent
   * + name it was actually keyed on in the UI does not.
   */
  async function upsertChild(input: {
    slug: string;
    name: string;
    icon: string;
    color: string;
    order: number;
    parentId: string;
    depth: number;
    parentPath: string;
  }): Promise<CategoryRow> {
    const existing = await prisma.category.findFirst({
      where: { parentId: input.parentId, name: input.name },
    });
    if (existing) {
      return prisma.category.update({
        where: { id: existing.id },
        data: { order: input.order },
      });
    }

    const row = await prisma.category.create({
      data: {
        slug: input.slug,
        name: input.name,
        description: '',
        icon: input.icon,
        color: input.color,
        order: input.order,
        visible: true,
        parentId: input.parentId,
        depth: input.depth,
        path: '/pending/',
      },
    });
    return finalisePath(row, input.parentPath);
  }

  for (const c of CATEGORIES) {
    const cat = await upsertRoot({
      slug: c.slug,
      name: c.name,
      description: c.description,
      icon: c.icon,
      color: c.color,
      order: c.order,
    });

    for (const [i, label] of c.children.entries()) {
      await upsertChild({
        slug: seedSlug(label, c.slug),
        name: label,
        icon: c.icon,
        color: c.color,
        order: i,
        parentId: cat.id,
        depth: 1,
        parentPath: cat.path,
      });
    }
  }

  // Demonstration geographic branch, 4 levels deep, so a fresh clone
  // shows the funnel immediately: Portugal -> Madeira -> Funchal -> Sé.
  // Nested under the existing "portugal" root rather than its own entry
  // in CATEGORIES above, since it is not itself a root. Dev-only, like
  // the rest of this seed (see the NODE_ENV guard at the top of the file).
  const portugal = await prisma.category.findUnique({ where: { slug: 'portugal' } });
  if (portugal) {
    const madeira = await upsertChild({
      slug: 'madeira-portugal',
      name: 'Madeira',
      icon: portugal.icon,
      color: portugal.color,
      order: 100,
      parentId: portugal.id,
      depth: 1,
      parentPath: portugal.path,
    });
    const funchal = await upsertChild({
      slug: 'funchal',
      name: 'Funchal',
      icon: portugal.icon,
      color: portugal.color,
      order: 0,
      parentId: madeira.id,
      depth: 2,
      parentPath: madeira.path,
    });
    await upsertChild({
      slug: 'se-funchal',
      name: 'Sé',
      icon: portugal.icon,
      color: portugal.color,
      order: 0,
      parentId: funchal.id,
      depth: 3,
      parentPath: funchal.path,
    });
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

    // Pre-built structured fields for the first 3 published articles so
    // the public site demonstrates the new caixas (essentials/context/quote).
    const RICH_DETAILS: Record<
      string,
      {
        essentials: string[];
        context: { columns: { label: string; body: string }[] };
        pullQuote: { quote: string; cite: string };
      }
    > = {
      'governo-apresenta-proposta-de-orcamento-com-aumento-de-3-2': {
        essentials: [
          'Despesa pública aumenta 3,2% face ao orçamento de 2025.',
          'Investimento em saúde e educação sobe 5,4%.',
          'Défice previsto de 1,8% do PIB, dentro do limite europeu.',
          'Oposição critica falta de reformas estruturais.',
        ],
        context: {
          columns: [
            {
              label: 'O que aconteceu',
              body: 'Governo entregou a proposta de OE2026 na Assembleia da República.',
            },
            {
              label: 'Porque importa',
              body: 'Define a política fiscal e social para os próximos 12 meses.',
            },
            {
              label: 'Próximo passo',
              body: 'Debate na generalidade previsto para 28 de Abril.',
            },
          ],
        },
        pullQuote: {
          quote:
            'Apresentamos um orçamento que investe no futuro sem comprometer a estabilidade que os portugueses merecem.',
          cite: 'Ministro das Finanças, conferência de imprensa',
        },
      },
      'banco-de-portugal-reve-projecao-do-pib-em-alta-para-2026': {
        essentials: [
          'Projeção de crescimento do PIB sobe de 1,9% para 2,3%.',
          'Inflação esperada estabiliza nos 2,1%.',
          'Exportações continuam a impulsionar a procura externa.',
        ],
        context: {
          columns: [
            {
              label: 'O que aconteceu',
              body: 'Banco de Portugal publicou o Boletim Económico de Primavera.',
            },
            {
              label: 'Porque importa',
              body: 'Confirma resiliência da economia portuguesa face à incerteza global.',
            },
            {
              label: 'Próximo passo',
              body: 'Próxima atualização ao Boletim em Junho.',
            },
          ],
        },
        pullQuote: {
          quote:
            'A economia portuguesa mostra-se robusta, mas os riscos externos permanecem elevados.',
          cite: 'Governador do Banco de Portugal',
        },
      },
      'crise-da-habitacao-em-lisboa-atinge-novos-maximos': {
        essentials: [
          'Preço médio por m² em Lisboa ultrapassa 5.400€.',
          'Tempo de poupança para entrada chega aos 11 anos.',
          'Jovens deixam centro da cidade em busca de arrendamento acessível.',
        ],
        context: {
          columns: [
            {
              label: 'O que aconteceu',
              body: 'INE divulgou novos números do imobiliário no 1.º trimestre.',
            },
            {
              label: 'Porque importa',
              body: 'Habitação é a prioridade número um nos inquéritos à juventude.',
            },
            {
              label: 'Próximo passo',
              body: 'Câmara de Lisboa apresenta plano municipal em Maio.',
            },
          ],
        },
        pullQuote: {
          quote:
            'Estamos a perder uma geração inteira para fora da cidade — é urgente agir.',
          cite: 'Especialista em política urbana, ISCTE',
        },
      },
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
        const rich = RICH_DETAILS[slug];
        await prisma.article.upsert({
          where: { slug },
          update: rich
            ? {
                essentials: rich.essentials,
                context: rich.context as never,
                pullQuote: rich.pullQuote as never,
              }
            : {},
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
            essentials: rich?.essentials ?? [],
            context: (rich?.context as never) ?? null,
            pullQuote: (rich?.pullQuote as never) ?? null,
          },
        });
      }
    }

    // ── The funnel, demonstrated ────────────────────────────────────
    // One published article at the very bottom of Portugal › Madeira ›
    // Funchal › Sé. Without it the demo branch exists but demonstrates
    // nothing: the point is that opening "Portugal" on the public site
    // surfaces a piece filed four levels down.
    const se = await prisma.category.findUnique({ where: { slug: 'se-funchal' } });
    if (se) {
      await prisma.article.upsert({
        where: { slug: 'obras-de-requalificacao-na-rua-da-se' },
        update: {},
        create: {
          slug: 'obras-de-requalificacao-na-rua-da-se',
          title: 'Obras de requalificação arrancam na Rua da Sé',
          summary:
            'A empreitada na zona velha do Funchal deverá estar concluída antes do verão.',
          content:
            '<p>As obras de requalificação da Rua da Sé arrancaram esta semana.</p>' +
            '<p>Este artigo está publicado no <strong>subtópico</strong> Sé — quatro ' +
            'níveis abaixo de Portugal — e aparece na página de Portugal, da Madeira ' +
            'e do Funchal por causa do afunilamento.</p>',
          status: 'PUBLICADO',
          categoryId: se.id,
          authorId: authors[0]?.id ?? user.id,
          readMinutes: 3,
          views: 412,
          publishedAt: new Date(),
          essentials: [],
        },
      });
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
