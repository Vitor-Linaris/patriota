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
    { slug: 'ambiente', name: 'Ambiente', description: 'Clima, energia e conservação.', icon: '◈', color: '#15803d', order: 13, children: ['Alterações Climáticas', 'Energia', 'Biodiversidade'] },
    { slug: 'ciencia', name: 'Ciência', description: 'Investigação científica e descobertas.', icon: '◎', color: '#6d28d9', order: 14, children: ['Espaço', 'Medicina', 'Investigação'] },
    { slug: 'educacao', name: 'Educação', description: 'Ensino básico, secundário e superior.', icon: '◇', color: '#0369a1', order: 15, children: ['Ensino Superior', 'Escolas', 'Bolsas e Apoios'] },
    { slug: 'justica', name: 'Justiça', description: 'Tribunais, legislação e processos judiciais.', icon: '◉', color: '#4338ca', order: 16, children: ['Tribunais', 'Legislação', 'Casos Mediáticos'] },
    { slug: 'motores', name: 'Motores', description: 'Automóveis, motociclismo e mobilidade.', icon: '▣', color: '#b91c1c', order: 17, children: ['Automóveis', 'Motociclismo', 'Mobilidade Elétrica'] },
    { slug: 'viagens', name: 'Viagens', description: 'Turismo, destinos e roteiros.', icon: '◑', color: '#0d9488', order: 18, children: ['Destinos Nacionais', 'Destinos Internacionais', 'Dicas de Viagem'] },
    { slug: 'gastronomia', name: 'Gastronomia', description: 'Restaurantes, receitas e vinhos.', icon: '◈', color: '#c2410c', order: 19, children: ['Receitas', 'Restaurantes', 'Vinhos'] },
    { slug: 'moda', name: 'Moda & Estilo', description: 'Tendências, moda portuguesa e lifestyle.', icon: '◎', color: '#be185d', order: 20, children: ['Tendências', 'Moda Portuguesa'] },
    { slug: 'religiao', name: 'Religião', description: 'Igreja, fé e comunidades religiosas.', icon: '◌', color: '#854d0e', order: 21, children: ['Igreja Católica', 'Outras Confissões'] },
    { slug: 'autarquias', name: 'Autarquias', description: 'Câmaras municipais e poder local.', icon: '◆', color: '#166534', order: 22, children: ['Câmaras Municipais', 'Freguesias', 'Orçamentos Participativos'] },
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
        // Dated three days back and older. These are filler without
        // photography, and `getHomepageBundle` picks the single most
        // recent published article as the hero — left at "now" they won
        // that slot and the front page opened on an empty grey box.
        // The ten photo pieces further down own the recent window.
        const publishedAt =
          status === 'PUBLICADO'
            ? new Date(Date.now() - (72 + i * 3) * 3600_000)
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

  // ── Featured demo articles, WITH photography ─────────────────────
  //
  // Deliberately outside the `existingArticles < 30` guard above: that
  // guard exists so re-running the seed does not keep piling on filler,
  // but these ten are keyed by slug and upserted, so they land exactly
  // once no matter how many articles already exist. They are what an
  // empty-looking demo actually needs — every one of them is published,
  // recent, and carries a cover photo.
  //
  // The images are committed under frontend/public/demo/ rather than
  // hotlinked or uploaded: served same-origin (so no next.config
  // remotePatterns and no Media visibility rules to satisfy), present on
  // any machine that has the repo, and needing no outbound internet on
  // the server that shows them.
  //
  // One per category created above, so no section in the menu opens onto
  // an empty page during the presentation.
  const PHOTO_ARTICLES: {
    slug: string;
    category: string;
    title: string;
    summary: string;
    content: string;
    hoursAgo: number;
  }[] = [
    {
      slug: 'renovaveis-batem-recorde-com-71-por-cento-da-eletricidade',
      category: 'ambiente',
      title: 'Renováveis batem recorde e garantem 71% da eletricidade em 2025',
      summary:
        'A produção eólica e solar ultrapassou pela primeira vez a marca dos dois terços do consumo nacional, segundo dados da REN.',
      content:
        '<p>Portugal fechou 2025 com <strong>71% da eletricidade consumida</strong> a ter origem em fontes renováveis, o valor mais alto alguma vez registado.</p>' +
        '<p>O crescimento é explicado sobretudo pela entrada em serviço de novos parques solares no Alentejo e pelo reforço da capacidade eólica no Norte.</p>' +
        '<p>A REN sublinha que a estabilidade da rede foi mantida em todos os meses do ano, apesar da maior intermitência associada a estas fontes.</p>',
      hoursAgo: 2,
    },
    {
      slug: 'telescopio-com-tecnologia-portuguesa-mapeia-materia-escura',
      category: 'ciencia',
      title: 'Telescópio com tecnologia portuguesa ajuda a mapear a matéria escura',
      summary:
        'Investigadores nacionais integram o consórcio internacional que assinou a observação mais detalhada de sempre da Via Láctea.',
      content:
        '<p>Uma equipa portuguesa participou no desenvolvimento do espectrógrafo que permitiu obter o mapa mais detalhado de sempre da distribuição de <strong>matéria escura</strong> na nossa galáxia.</p>' +
        '<p>Os resultados foram publicados esta semana e envolvem instituições de sete países europeus.</p>' +
        '<p>Segundo os autores, os dados vão permitir testar modelos cosmológicos que até aqui só existiam em simulação.</p>',
      hoursAgo: 5,
    },
    {
      slug: 'ensino-superior-recebe-numero-recorde-de-candidatos',
      category: 'educacao',
      title: 'Ensino superior recebe número recorde de candidatos na primeira fase',
      summary:
        'Mais de 65 mil estudantes concorreram ao concurso nacional de acesso, com engenharia e saúde a liderar a procura.',
      content:
        '<p>O concurso nacional de acesso ao ensino superior registou este ano o <strong>maior número de candidatos de sempre</strong>.</p>' +
        '<p>Os cursos de engenharia informática, medicina e enfermagem concentram mais de um quinto das primeiras opções.</p>' +
        '<p>As instituições do interior mantêm vagas por preencher, apesar dos incentivos criados nos últimos três anos.</p>',
      hoursAgo: 9,
    },
    {
      slug: 'relacao-fixa-jurisprudencia-sobre-arrendamento-urbano',
      category: 'justica',
      title: 'Tribunal da Relação fixa jurisprudência sobre arrendamento urbano',
      summary:
        'A decisão uniformiza o entendimento sobre atualização de rendas em contratos anteriores a 1990 e afeta milhares de processos.',
      content:
        '<p>O Tribunal da Relação fixou esta semana jurisprudência sobre a atualização de rendas em <strong>contratos anteriores a 1990</strong>.</p>' +
        '<p>A decisão põe fim a anos de interpretações divergentes entre comarcas e deverá refletir-se em milhares de processos pendentes.</p>' +
        '<p>Associações de proprietários e de inquilinos já reagiram, com leituras opostas sobre o alcance do acórdão.</p>',
      hoursAgo: 14,
    },
    {
      slug: 'carros-eletricos-ja-sao-um-em-cada-quatro-vendidos',
      category: 'motores',
      title: 'Carros elétricos já são um em cada quatro vendidos em Portugal',
      summary:
        'O mercado nacional acompanha a média europeia, mas a rede de carregamento continua concentrada no litoral.',
      content:
        '<p>Um em cada quatro automóveis novos vendidos em Portugal é <strong>totalmente elétrico</strong>, segundo os dados mais recentes da ACAP.</p>' +
        '<p>O crescimento é mais acentuado nas frotas empresariais, onde o benefício fiscal é mais relevante.</p>' +
        '<p>O principal travão continua a ser a rede de carregamento rápido, ainda muito concentrada nos distritos do litoral.</p>',
      hoursAgo: 20,
    },
    {
      slug: 'porto-eleito-melhor-destino-europeu-de-city-break',
      category: 'viagens',
      title: 'Porto eleito melhor destino europeu de city break pelo terceiro ano',
      summary:
        'A cidade voltou a superar Praga e Budapeste na votação anual, com destaque para a gastronomia e a relação qualidade-preço.',
      content:
        '<p>O Porto foi novamente distinguido como <strong>melhor destino europeu de city break</strong>, somando o terceiro ano consecutivo no topo.</p>' +
        '<p>O júri destacou a oferta gastronómica, a facilidade de circulação a pé e a relação qualidade-preço do alojamento.</p>' +
        '<p>O setor alerta, porém, para a pressão turística no centro histórico e para o impacto no arrendamento residencial.</p>',
      hoursAgo: 27,
    },
    {
      slug: 'vinhos-do-douro-conquistam-tres-medalhas-de-ouro',
      category: 'gastronomia',
      title: 'Vinhos do Douro conquistam três medalhas de ouro em concurso internacional',
      summary:
        'A colheita de 2024 foi premiada em Bruxelas e consolida o crescimento das exportações para os mercados asiáticos.',
      content:
        '<p>Três vinhos do Douro foram distinguidos com <strong>medalha de ouro</strong> num dos concursos internacionais mais concorridos do setor.</p>' +
        '<p>A colheita de 2024 beneficiou de um verão menos quente do que os anteriores, com efeitos visíveis na acidez e no equilíbrio dos vinhos.</p>' +
        '<p>As exportações para a Ásia cresceram 18% no último ano e representam já um quinto do total.</p>',
      hoursAgo: 34,
    },
    {
      slug: 'moda-portuguesa-cresce-12-por-cento-nas-exportacoes',
      category: 'moda',
      title: 'Moda portuguesa cresce 12% nas exportações para o mercado europeu',
      summary:
        'O têxtil do Vale do Ave lidera a recuperação, impulsionado por encomendas de marcas que aproximaram a produção da Europa.',
      content:
        '<p>As exportações de vestuário e calçado cresceram <strong>12% no último ano</strong>, com o mercado europeu a absorver a maior parte do aumento.</p>' +
        '<p>O setor beneficia da decisão de várias marcas internacionais de aproximar a produção dos mercados de destino.</p>' +
        '<p>A falta de mão de obra qualificada é apontada pelos industriais como o principal risco para os próximos anos.</p>',
      hoursAgo: 41,
    },
    {
      slug: 'santuario-de-fatima-apresenta-plano-de-acessibilidade',
      category: 'religiao',
      title: 'Santuário de Fátima apresenta novo plano de acessibilidade',
      summary:
        'As obras vão decorrer fora do período das grandes peregrinações e incluem percursos adaptados em todo o recinto.',
      content:
        '<p>O Santuário de Fátima apresentou um plano de <strong>acessibilidade universal</strong> que abrange todo o recinto.</p>' +
        '<p>A intervenção inclui percursos adaptados, sinalética acessível e novos lugares reservados na capelinha das aparições.</p>' +
        '<p>Os trabalhos vão decorrer fora do período das grandes peregrinações de maio e outubro.</p>',
      hoursAgo: 50,
    },
    {
      slug: 'orcamentos-participativos-com-verba-recorde-nas-autarquias',
      category: 'autarquias',
      title: 'Câmaras aprovam orçamentos participativos com verba recorde',
      summary:
        'Mais de 150 municípios vão submeter a votação dos moradores um total superior a 60 milhões de euros.',
      content:
        '<p>Mais de 150 câmaras municipais aprovaram <strong>orçamentos participativos</strong> para o próximo ano, num total superior a 60 milhões de euros.</p>' +
        '<p>A mobilidade suave e os espaços verdes concentram a maioria das propostas submetidas pelos moradores.</p>' +
        '<p>A taxa de execução dos projetos vencedores continua, no entanto, abaixo dos 60% na maioria dos municípios.</p>',
      hoursAgo: 62,
    },
  ];

  const photoAuthors = await prisma.user.findMany({
    where: { role: { in: ['EDITOR', 'EDITOR_CHEFE', 'JORNALISTA'] } },
  });
  for (const [i, a] of PHOTO_ARTICLES.entries()) {
    const cat = await prisma.category.findUnique({ where: { slug: a.category } });
    if (!cat) continue;
    const cover = `/demo/artigos/${a.category}.jpg`;
    const author = photoAuthors[i % photoAuthors.length];
    await prisma.article.upsert({
      where: { slug: a.slug },
      // Kept in sync on re-run: the cover is the whole point of these
      // rows, so a seed that left an older imageless version in place
      // would defeat the exercise.
      update: {
        title: a.title,
        summary: a.summary,
        content: a.content,
        coverImageUrl: cover,
        status: 'PUBLICADO',
        categoryId: cat.id,
      },
      create: {
        slug: a.slug,
        title: a.title,
        summary: a.summary,
        content: a.content,
        coverImageUrl: cover,
        status: 'PUBLICADO',
        categoryId: cat.id,
        authorId: author?.id ?? user.id,
        readMinutes: 3 + (i % 5),
        views: 800 + i * 137,
        publishedAt: new Date(Date.now() - a.hoursAgo * 3600_000),
        essentials: [],
      },
    });
  }

  // ── Advertising slots, filled with sized banners ──────────────────
  //
  // Each banner was cropped to the exact size the slot advertises
  // (AdsService.DEFAULT_ADS), so nothing is letterboxed or upscaled.
  // `ensureDefaults()` on the API creates the rows and deliberately
  // never touches type/imageUrl, so filling them here is safe and is
  // not undone on the next boot.
  const AD_BANNERS: { id: string; alt: string }[] = [
    { id: 'homepage-leaderboard', alt: 'Banco Atlântico — crédito habitação' },
    { id: 'homepage-mid', alt: 'Vinhos do Douro — colheita de 2024' },
    { id: 'homepage-sidebar', alt: 'Universidade Nova — candidaturas abertas' },
    { id: 'homepage-prefooter', alt: 'TAP Portugal — Lisboa para São Paulo' },
    { id: 'article-leaderboard', alt: 'EDP Renováveis — energia do Atlântico' },
    { id: 'article-incontent', alt: 'Livraria Bertrand — os livros do mês' },
    { id: 'article-sidebar', alt: 'Seguros Fidelidade' },
    { id: 'article-prefooter', alt: 'Turismo da Madeira' },
    { id: 'category-leaderboard', alt: 'Continente — campanha de poupança' },
    { id: 'category-sidebar', alt: 'Café Delta' },
    { id: 'category-prefooter', alt: 'Auto Elétrico PT — test drive' },
  ];
  for (const b of AD_BANNERS) {
    // updateMany, not update: the row only exists after the API has run
    // ensureDefaults() at least once, and a seed on a fresh database
    // must not explode just because the API has not booted yet.
    await prisma.ad.updateMany({
      where: { id: b.id },
      data: {
        type: 'IMAGE',
        enabled: true,
        imageUrl: `/demo/publicidade/${b.id}.jpg`,
        altText: b.alt,
        linkUrl: 'https://exemplo.pt',
        linkTarget: '_blank',
      },
    });
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
