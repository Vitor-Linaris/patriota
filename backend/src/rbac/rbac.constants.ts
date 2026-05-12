import { Role } from '../../generated/prisma/enums';

export { Role };

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
      { key: 'artigos.editar_proprios', label: 'Editar próprios', description: 'Editar apenas próprios artigos' },
      { key: 'artigos.editar_todos', label: 'Editar todos', description: 'Editar artigos de outros utilizadores' },
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
      { key: 'utilizadores.suspender', label: 'Suspender/Eliminar', description: 'Bloquear ou remover contas' },
      { key: 'utilizadores.atribuir_roles', label: 'Atribuir roles', description: 'Mudar o papel de um utilizador' },
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
];

export const ALL_PERMISSIONS: string[] = MODULES.flatMap((m) =>
  m.permissions.map((p) => p.key),
);

/**
 * Default permission set per role. SUPER_ADMIN bypasses checks and has all.
 * EDITOR_CHEFE has everything except editing the RBAC matrix itself.
 */
export const DEFAULT_ROLE_PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: [...ALL_PERMISSIONS],
  EDITOR_CHEFE: ALL_PERMISSIONS.filter((p) => p !== 'configuracoes.permissoes'),
  EDITOR: [
    'artigos.ler',
    'artigos.criar',
    'artigos.editar_proprios',
    'artigos.editar_todos',
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
    'categorias.ver',
    'media.carregar',
  ],
  REVISOR: [
    'artigos.ler',
    'artigos.editar_proprios',
    'comentarios.ver',
    'comentarios.aprovar',
  ],
  MODERADOR: [
    'comentarios.ver',
    'comentarios.aprovar',
    'comentarios.eliminar',
    'utilizadores.ver',
    'utilizadores.suspender',
  ],
  ANALISTA: [
    'analytics.basicas',
    'analytics.avancadas',
    'analytics.exportar',
    'artigos.ler',
  ],
};
