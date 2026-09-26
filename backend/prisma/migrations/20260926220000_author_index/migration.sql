-- Indice em falta: authorId nunca teve indice proprio, so a chave
-- estrangeira. Toda consulta "artigos deste autor" era uma varredura
-- completa da tabela Article. Passou a importar de verdade com o
-- perfil publico do redator (contagem + ultimos 10) e com a nova
-- verificacao de visibilidade do avatar, que corre a cada imagem
-- pedida.
CREATE INDEX "Article_authorId_status_idx" ON "Article"("authorId", "status");
