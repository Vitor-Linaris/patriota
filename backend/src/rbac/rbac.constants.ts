import { Role, ReaderPlan } from '../../generated/prisma/enums';

export { Role, ReaderPlan };

export const ROLE_LABELS: Record<Role, string> = {
  SUPER_ADMIN: 'Super Admin',
  EDITOR_CHEFE: 'Editor-Chefe',
  EDITOR: 'Editor',
  JORNALISTA: 'Jornalista',
  REVISOR: 'Revisor',
  MODERADOR: 'Moderador',
  ANALISTA: 'Analista',
};

export const ROLE_ORDER: Role[] = [
  'SUPER_ADMIN',
  'EDITOR_CHEFE',
  'EDITOR',
  'JORNALISTA',
  'REVISOR',
  'MODERADOR',
  'ANALISTA',
];

/**
 * Catalogue of all RBAC modules and permissions in the system.
 * The keys are the canonical permission strings stored in the DB
 * (e.g. "artigos.publicar"). Labels are user-facing (pt-PT).
 */
export interface PermissionDef {
  key: string;
  label: string;
  description: string;
}

export interface ModuleDef {
  key: string;
  label: string;
  permissions: PermissionDef[];
}

export const MODULES: ModuleDef[] = [
  {
    key: 'artigos',
    label: 'Artigos',
    permissions: [
      { key: 'artigos.ler', label: 'Ler artigos', description: 'Visualizar artigos publicados' },
      { key: 'artigos.criar', label: 'Criar artigos', description: 'Criar e editar rascunhos' },
      {
        key: 'artigos.ler_todos',
        label: 'Ver todos',
        description:
          'Ver a lista de artigos de todos os utilizadores, não só os próprios (sem poder editá-los)',
      },
      { key: 'artigos.editar_proprios', label: 'Editar próprios', description: 'Editar apenas próprios artigos' },
      { key: 'artigos.editar_todos', label: 'Editar todos', description: 'Editar artigos de outros utilizadores' },
      { key: 'artigos.submeter', label: 'Submeter para revisão', description: 'Enviar rascunho para a fila de aprovação' },
      { key: 'artigos.aprovar', label: 'Aprovar revisão', description: 'Aprovar ou recusar artigos em revisão' },
      { key: 'artigos.publicar', label: 'Publicar', description: 'Tornar artigos disponíveis ao público' },
      { key: 'artigos.despublicar', label: 'Despublicar', description: 'Remover artigos do público' },
      { key: 'artigos.eliminar', label: 'Eliminar', description: 'Apagar artigos permanentemente' },
      { key: 'artigos.arquivar', label: 'Arquivar', description: 'Mover artigos para o arquivo' },
    ],
  },
  {
    key: 'categorias',
    label: 'Categorias',
    permissions: [
      { key: 'categorias.ver', label: 'Ver categorias', description: 'Listar categorias do site' },
      { key: 'categorias.criar', label: 'Criar categoria', description: 'Adicionar novas categorias' },
      { key: 'categorias.editar', label: 'Editar categoria', description: 'Renomear ou reordenar categorias' },
      { key: 'categorias.eliminar', label: 'Eliminar categoria', description: 'Remover categorias do site' },
    ],
  },
  {
    key: 'utilizadores',
    label: 'Utilizadores',
    permissions: [
      { key: 'utilizadores.ver', label: 'Ver utilizadores', description: 'Listar utilizadores da plataforma' },
      { key: 'utilizadores.criar', label: 'Criar utilizador', description: 'Registar novos utilizadores' },
      { key: 'utilizadores.editar', label: 'Editar utilizador', description: 'Atualizar dados de utilizadores' },
      { key: 'utilizadores.suspender', label: 'Suspender/Activar', description: 'Bloquear ou reactivar contas' },
      { key: 'utilizadores.atribuir_roles', label: 'Atribuir roles', description: 'Mudar o papel de um utilizador' },
      { key: 'utilizadores.resetar_password', label: 'Repor palavra-passe', description: 'Gerar nova palavra-passe temporária para outros' },
      { key: 'utilizadores.eliminar', label: 'Eliminar utilizador', description: 'Apagar conta permanentemente' },
    ],
  },
  {
    key: 'comentarios',
    label: 'Comentários',
    permissions: [
      { key: 'comentarios.ver', label: 'Ver comentários', description: 'Aceder à fila de moderação' },
      { key: 'comentarios.aprovar', label: 'Aprovar', description: 'Publicar comentários pendentes' },
      { key: 'comentarios.eliminar', label: 'Eliminar', description: 'Remover comentários' },
    ],
  },
  {
    key: 'leitores',
    label: 'Leitores',
    permissions: [
      { key: 'leitores.ver', label: 'Ver leitores', description: 'Listar as contas do público e pesquisar entre elas' },
      { key: 'leitores.suspender', label: 'Suspender/Banir', description: 'Banir um leitor por 15 dias, 30 dias ou definitivamente' },
      { key: 'leitores.oferecer_assinatura', label: 'Oferecer assinatura', description: 'Dar ou retirar assinatura à mão, sem pagamento' },
    ],
  },
  {
    key: 'media',
    label: 'Média',
    permissions: [
      { key: 'media.carregar', label: 'Carregar ficheiros', description: 'Upload de imagens e vídeos' },
      { key: 'media.editar_metadados', label: 'Editar metadados', description: 'Alt-text, legendas, créditos' },
      { key: 'media.eliminar', label: 'Eliminar ficheiros', description: 'Apagar média do servidor' },
    ],
  },
  {
    key: 'analytics',
    label: 'Analytics',
    permissions: [
      { key: 'analytics.basicas', label: 'Métricas básicas', description: 'Vistas e impressões' },
      { key: 'analytics.avancadas', label: 'Métricas avançadas', description: 'Funis, segmentação, retenção' },
      { key: 'analytics.exportar', label: 'Exportar dados', description: 'Download de relatórios em CSV' },
    ],
  },
  {
    key: 'newsletter',
    label: 'Newsletter',
    permissions: [
      { key: 'newsletter.listas', label: 'Gerir listas', description: 'Criar e editar listas de subscritores' },
      { key: 'newsletter.enviar', label: 'Enviar newsletter', description: 'Disparar campanhas' },
    ],
  },
  {
    key: 'configuracoes',
    label: 'Configurações',
    permissions: [
      { key: 'configuracoes.aceder', label: 'Aceder configurações', description: 'Ver definições do site' },
      { key: 'configuracoes.editar', label: 'Editar configurações', description: 'Alterar definições gerais' },
      { key: 'configuracoes.permissoes', label: 'Gerir permissões', description: 'Editar a matriz RBAC' },
    ],
  },
  {
    key: 'publicidade',
    label: 'Publicidade',
    permissions: [
      // Deliberately the only permission here, rather than a full
      // ver/editar/eliminar set. Seeing and editing an ad already runs
      // on `configuracoes.editar`, and moving them would silently
      // remove advertising from anybody whose permission matrix was
      // customised — the guard requires ALL listed permissions, so
      // there is no way to accept either one.
      //
      // A permission nothing checks is worse than none: it shows up in
      // the matrix and does nothing, which tells the administrator
      // something untrue.
      //
      // This one is genuinely new, and separate because it is a
      // different kind of act. Swapping a banner is everyday work;
      // deleting the file off the disk cannot be undone, so somebody
      // without this asks somebody who has it.
      { key: 'publicidade.eliminar_imagem', label: 'Eliminar imagem de publicidade', description: 'Apagar de vez o ficheiro de um banner — não é possível recuperar' },
    ],
  },
];

export const ALL_PERMISSIONS: string[] = MODULES.flatMap((m) =>
  m.permissions.map((p) => p.key),
);

// ─────────────────────────── reader plans ───────────────────────────
//
// A SECOND, separate axis. Everything above answers "what may this
// member of the newsroom do"; everything below answers "what may a
// reader on this plan do". They are stored apart (PlanPermissions vs
// RolePermissions) and validated apart, and that separation is the point:
// merging the two lists would put `assinantes.ler_exclusivos` inside
// ALL_PERMISSIONS, where EDITOR_CHEFE's "everything except the RBAC
// matrix" filter would hand it to staff — a reader permission granted to
// people who are not readers, silently.
//
// The plan of a reader is not a Role, so it cannot ride in the existing
// table either: `Reader.plan` is its own enum.

export const PLAN_LABELS: Record<ReaderPlan, string> = {
  GRATIS: 'Gratuito',
  PREMIUM: 'Assinante',
};

export const PLAN_ORDER: ReaderPlan[] = ['GRATIS', 'PREMIUM'];

export const PLAN_MODULES: ModuleDef[] = [
  {
    key: 'assinantes',
    label: 'O que cada plano pode',
    permissions: [
      { key: 'assinantes.ler_exclusivos', label: 'Ler exclusivos', description: 'Aceder aos artigos marcados como exclusivos, por inteiro' },
      { key: 'assinantes.comentar', label: 'Comentar', description: 'Escrever comentários nos artigos' },
      { key: 'assinantes.guardar_artigos', label: 'Guardar artigos', description: 'Guardar artigos para ler mais tarde' },
      { key: 'assinantes.seguir_categorias', label: 'Seguir categorias', description: 'Seguir secções e receber aviso de artigos novos' },
    ],
  },
];

export const ALL_PLAN_PERMISSIONS: string[] = PLAN_MODULES.flatMap((m) =>
  m.permissions.map((p) => p.key),
);

/**
 * Defaults per plan.
 *
 * GRATIS is deliberately a description of what a free reader can already
 * do today, so switching this on changes nothing for anybody. The single
 * difference PREMIUM brings is the exclusives — which is the whole
 * proposition, and the only line the paywall will read.
 */
export const DEFAULT_PLAN_PERMISSIONS: Record<ReaderPlan, string[]> = {
  GRATIS: [
    'assinantes.comentar',
    'assinantes.guardar_artigos',
    'assinantes.seguir_categorias',
  ],
  PREMIUM: [...ALL_PLAN_PERMISSIONS],
};

/**
 * Default permission set per role. SUPER_ADMIN bypasses checks and has all.
 * EDITOR_CHEFE has everything except editing the RBAC matrix itself.
 */
/**
 * Role-assignment hierarchy. A user can only invite or change another
 * user's role to a role that appears in this list for their own role.
 *
 * The shape "actor → allowed targets" makes the rules explicit:
 *   • SUPER_ADMIN is the only role that can assign SUPER_ADMIN. Without
 *     this guard, an EDITOR_CHEFE that gained utilizadores.atribuir_roles
 *     could escalate themselves.
 *   • EDITOR_CHEFE can promote peers and everyone below.
 *   • EDITOR can only promote down to JORNALISTA (and only if they ever
 *     get utilizadores.criar — currently they don't, so this is dormant
 *     defence in depth).
 *   • Everyone else cannot assign roles.
 *
 * For role CHANGE, an actor must additionally be allowed to manage the
 * target's CURRENT role — see canManageUser() below — so an EDITOR_CHEFE
 * cannot demote a SUPER_ADMIN.
 */
export const ASSIGNABLE_ROLES: Record<Role, Role[]> = {
  SUPER_ADMIN: [
    'SUPER_ADMIN',
    'EDITOR_CHEFE',
    'EDITOR',
    'JORNALISTA',
    'REVISOR',
    'MODERADOR',
    'ANALISTA',
  ],
  EDITOR_CHEFE: [
    'EDITOR_CHEFE',
    'EDITOR',
    'JORNALISTA',
    'REVISOR',
    'MODERADOR',
    'ANALISTA',
  ],
  EDITOR: ['JORNALISTA'],
  JORNALISTA: [],
  REVISOR: [],
  MODERADOR: [],
  ANALISTA: [],
};

/** True when `actor` is allowed to assign `target` as a role to anyone. */
export function canAssignRole(actor: Role, target: Role): boolean {
  return ASSIGNABLE_ROLES[actor]?.includes(target) ?? false;
}

/**
 * True when `actor` is allowed to manage a user that currently holds
 * `targetCurrentRole` — useful for the role-change path so an
 * EDITOR_CHEFE cannot demote a SUPER_ADMIN.
 */
export function canManageUser(actor: Role, targetCurrentRole: Role): boolean {
  if (actor === 'SUPER_ADMIN') return true;
  return ASSIGNABLE_ROLES[actor]?.includes(targetCurrentRole) ?? false;
}

export const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],
  EDITOR_CHEFE: ALL_PERMISSIONS.filter((p) => p !== 'configuracoes.permissoes'),
  EDITOR: [
    'artigos.ler',
    'artigos.criar',
    'artigos.editar_proprios',
    'artigos.editar_todos',
    'artigos.submeter',
    'artigos.aprovar',
    'artigos.publicar',
    'artigos.despublicar',
    'artigos.arquivar',
    'categorias.ver',
    'categorias.criar',
    'categorias.editar',
    'comentarios.ver',
    'comentarios.aprovar',
    'media.carregar',
    'media.editar_metadados',
    'analytics.basicas',
  ],
  JORNALISTA: [
    'artigos.ler',
    'artigos.criar',
    'artigos.editar_proprios',
    'artigos.submeter',
    'categorias.ver',
    'media.carregar',
  ],
  REVISOR: [
    'artigos.ler',
    // Reviewing is inherently other people's work — a REVISOR with only
    // editar_proprios would only ever see the pieces they wrote
    // themselves, never the ones submitted for review by anyone else.
    'artigos.ler_todos',
    'artigos.editar_proprios',
    'artigos.submeter',
    'comentarios.ver',
    'comentarios.aprovar',
  ],
  MODERADOR: [
    'comentarios.ver',
    'comentarios.aprovar',
    'comentarios.eliminar',
    'leitores.ver',
    'leitores.suspender',
    // NOT leitores.oferecer_assinatura: handing out subscriptions is
    // giving away money, which is a different kind of decision from
    // moderating a thread. It stays with SUPER_ADMIN and EDITOR_CHEFE,
    // who get it through their own blanket grants.
    'utilizadores.ver',
    'utilizadores.suspender',
  ],
  ANALISTA: [
    'analytics.basicas',
    'analytics.avancadas',
    'analytics.exportar',
    'artigos.ler',
    // Analytics is across the whole corpus by nature — an ANALISTA
    // limited to their own articles (they don't author any) would see
    // an empty list instead of the numbers they're here to read.
    'artigos.ler_todos',
  ],
};
