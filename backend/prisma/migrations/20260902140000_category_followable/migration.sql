-- Separa "esta secção existe no site" de "convidamos os leitores a
-- segui-la por e-mail".
--
-- `visible` responde à primeira; esta coluna responde à segunda. Uma
-- secção pode estar no ar sem que a redacção queira ainda prometer um
-- e-mail sobre ela — uma categoria em experiência, ou uma que vai ser
-- renomeada para a semana.

ALTER TABLE "Category"
  ADD COLUMN "followable" BOOLEAN NOT NULL DEFAULT false;

-- As que já existem passam a seguíveis.
--
-- O default da coluna é `false` de propósito, para que uma categoria
-- acabada de criar não apareça na lista de toda a gente enquanto ainda
-- está a ser decidida. Mas aplicar esse default às que já cá estão seria
-- desligar de uma vez uma funcionalidade que já funciona, e esconder
-- categorias que os leitores já seguem.
--
-- Só as visíveis: uma categoria escondida do menu não deve reaparecer
-- pela porta do lado, na lista de seguir.
UPDATE "Category" SET "followable" = true WHERE "visible" = true;

-- E qualquer uma que alguém já siga, visível ou não. Deixá-la de fora
-- faria a página "categorias que sigo" mostrar uma linha que a lista de
-- seguir não conhece.
UPDATE "Category" c SET "followable" = true
WHERE EXISTS (
  SELECT 1 FROM "CategoryFavorite" f WHERE f."categoryId" = c."id"
);
