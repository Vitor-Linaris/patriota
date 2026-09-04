-- Limpa das linhas de RolePermissions as permissões que já não existem
-- no catálogo (rbac.constants.ts).
--
-- Em concreto, `publicidade.ver` e `publicidade.editar`, retiradas
-- quando se decidiu que ver e editar um anúncio corre sobre
-- `configuracoes.editar` — mas só retiradas do catálogo, nunca das
-- linhas que já as tinham (SUPER_ADMIN e EDITOR_CHEFE).
--
-- Isso deixava o ecrã de permissões impossível de gravar: a matriz
-- entregava as chaves obsoletas ao browser, o browser devolvia-as ao
-- gravar, e updateRolePermissions() recusava tudo com "Permissões
-- desconhecidas". Como o ecrã grava TODOS os papéis a cada clique,
-- bastava esta linha para nenhuma alteração a nenhum papel passar.
--
-- O serviço passa a filtrar isto à leitura (ver known() em
-- rbac.service.ts), o que resolve o sintoma para qualquer chave que
-- venha a ser retirada no futuro. Esta migração trata dos dados: sem
-- ela, as linhas ficavam lá para sempre, apenas escondidas pelo filtro.
--
-- Escrito contra a lista literal em vez de contra o catálogo, porque
-- SQL não o consegue ler: se amanhã outra chave for retirada, é
-- acrescentar outra migração como esta.

UPDATE "RolePermissions"
SET permissions = ARRAY(
  SELECT p FROM unnest(permissions) AS p
  WHERE p NOT IN ('publicidade.ver', 'publicidade.editar')
)
WHERE permissions && ARRAY['publicidade.ver', 'publicidade.editar'];
