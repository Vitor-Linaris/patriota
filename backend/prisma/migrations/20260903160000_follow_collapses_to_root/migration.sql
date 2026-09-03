-- Seguir deixa de ser por subsecção — passa a ser sempre pela categoria
-- de topo. Quem segue "Portugal" já recebe o que sair em
-- "Portugal › Madeira › Funchal › Sé" (notifyTargets(), em
-- reader-notifications.service.ts, já soma os ascendentes ao decidir
-- quem avisar), por isso seguir a subsecção nunca foi uma escolha mais
-- estreita — era a mesma subscrição, só que registada num nó que a
-- página de escolher já não vai mostrar.
--
-- Esta migração junta as linhas de CategoryFavorite que hoje apontam
-- para uma subsecção na linha da respectiva raiz.

-- 1) Onde o leitor já segue a raiz e a linha da subsecção tem os
--    e-mails ligados, herda esse "ligado" para a raiz antes de a
--    subsecção ser apagada a seguir — para ninguém perder o aviso por
--    e-mail que já tinha.
WITH leaf AS (
  SELECT
    f."readerId",
    f.notify,
    split_part(trim(both '/' from c.path), '/', 1) AS root_id
  FROM "CategoryFavorite" f
  JOIN "Category" c ON c.id = f."categoryId"
  WHERE c.depth > 0
)
UPDATE "CategoryFavorite" r
SET notify = true
FROM leaf
WHERE r."readerId" = leaf."readerId"
  AND r."categoryId" = leaf.root_id
  AND leaf.notify = true
  AND r.notify = false;

-- 2) Apaga as linhas de subsecção para quem já tinha (ou acabou de
--    herdar, no passo acima) a linha da raiz.
DELETE FROM "CategoryFavorite" f
USING "Category" c
WHERE f."categoryId" = c.id
  AND c.depth > 0
  AND EXISTS (
    SELECT 1 FROM "CategoryFavorite" r
    WHERE r."readerId" = f."readerId"
      AND r."categoryId" = split_part(trim(both '/' from c.path), '/', 1)
  );

-- 3) O que sobra — subsecções cujo leitor ainda não seguia a raiz por
--    nenhuma outra via — muda de sítio para a própria raiz, em vez de
--    ser apagado.
UPDATE "CategoryFavorite" f
SET "categoryId" = split_part(trim(both '/' from c.path), '/', 1)
FROM "Category" c
WHERE f."categoryId" = c.id
  AND c.depth > 0;
