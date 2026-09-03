-- A cadência por omissão dos avisos de artigo passa de DIARIO para
-- IMEDIATO.
--
-- Não existe em lado nenhum uma forma de o leitor escolher a cadência:
-- /conta/categorias oferece uma caixa "E-mails" por categoria e mais
-- nada. Ou seja, o valor desta coluna nunca foi uma escolha de ninguém —
-- é só o que toda a gente calhou apanhar. E o que toda a gente apanhava
-- era o resumo das 08:00, o que significa que quem marcava "avisem-me"
-- e via sair uma peça nessa tarde não recebia nada até à manhã
-- seguinte. Isso lê-se como avariado, não como uma definição.
--
-- IMEDIATO continua a agrupar: o tick correspondente junta tudo o que
-- estiver pendente numa única mensagem, para que publicar seis artigos
-- de seguida continue a ser um e-mail e não seis.

ALTER TABLE "Reader"
  ALTER COLUMN "digestFrequency" SET DEFAULT 'IMEDIATO';

-- As linhas que já cá estão passam também.
--
-- Só as que estão em DIARIO: essas são as que nunca foram escolhidas,
-- porque DIARIO era precisamente o valor de omissão. SEMANAL e NUNCA
-- ficam como estão — se algum dia alguém as definiu (por API, ou por um
-- ecrã que venha a existir), essa é uma decisão a respeitar, e NUNCA em
-- particular é um "não me mandem e-mails" que seria grave ignorar.
UPDATE "Reader"
SET "digestFrequency" = 'IMEDIATO'
WHERE "digestFrequency" = 'DIARIO';
