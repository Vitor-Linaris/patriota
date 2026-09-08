-- Dá as novas chaves `pacotes.*` aos papéis que já têm linha gravada em
-- RolePermissions.
--
-- Sem isto, a funcionalidade nasce invisível. DEFAULT_ROLE_PERMISSIONS
-- (rbac.constants.ts) só se aplica a papéis SEM linha na tabela: quem já
-- passou pelo ecrã /admin/permissions tem uma linha explícita, e essa
-- linha não conhece chaves que não existiam quando foi gravada. O
-- SUPER_ADMIN veria "Pacotes" no menu e mais ninguém, sem nada no ecrã a
-- explicar porquê.
--
-- Os conjuntos abaixo espelham DEFAULT_ROLE_PERMISSIONS à data desta
-- migração. Escritos literalmente porque SQL não consegue ler o
-- catálogo — mesma razão e mesmo padrão de
-- 20260903210000_prune_retired_permissions.
--
-- Idempotente: só acrescenta o que falta (array_agg sobre a união), pelo
-- que correr duas vezes não duplica nada e não desfaz personalizações
-- feitas na matriz.

-- SUPER_ADMIN: tudo.
-- EDITOR_CHEFE: tudo excepto configuracoes.permissoes — o que, em
-- pacotes, é tudo.
UPDATE "RolePermissions"
SET permissions = ARRAY(
  SELECT DISTINCT p FROM unnest(
    permissions || ARRAY[
      'pacotes.ver', 'pacotes.criar', 'pacotes.editar', 'pacotes.publicar',
      'pacotes.eliminar', 'pacotes.ver_compras', 'pacotes.oferecer',
      'pacotes.revogar_compra'
    ]
  ) AS p
)
WHERE role IN ('SUPER_ADMIN', 'EDITOR_CHEFE');

-- EDITOR: monta e fecha pacotes. Sem eliminar/oferecer/revogar/ver_compras
-- (destroem um registo pago ou dão dinheiro). O `publicar` é seguro aqui
-- porque o serviço exige TAMBÉM artigos.publicar para publicar um pacote
-- com rascunhos, e o EDITOR já o tem.
UPDATE "RolePermissions"
SET permissions = ARRAY(
  SELECT DISTINCT p FROM unnest(
    permissions || ARRAY[
      'pacotes.ver', 'pacotes.criar', 'pacotes.editar', 'pacotes.publicar'
    ]
  ) AS p
)
WHERE role = 'EDITOR';

-- JORNALISTA: só ver, para o campo "Pacote" no editor de artigos lhe
-- dizer a que pacote a peça pertence. Atribuir escreve PackageArticle e
-- exige pacotes.editar.
UPDATE "RolePermissions"
SET permissions = ARRAY(
  SELECT DISTINCT p FROM unnest(permissions || ARRAY['pacotes.ver']) AS p
)
WHERE role = 'JORNALISTA';

-- ANALISTA: os números são o trabalho dele. Leitura apenas.
UPDATE "RolePermissions"
SET permissions = ARRAY(
  SELECT DISTINCT p FROM unnest(
    permissions || ARRAY['pacotes.ver', 'pacotes.ver_compras']
  ) AS p
)
WHERE role = 'ANALISTA';
