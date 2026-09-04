-- Vídeo incorporado de uma parceria (ex.: naminhaterra.com), mostrado
-- logo abaixo da imagem de capa na página do artigo. Ver VideoEmbedUrl
-- na página de artigo (frontend) e VideoEmbed.tsx para como o formato
-- do URL decide se toca como <video>, iframe do YouTube/Vimeo, ou
-- iframe genérico.

ALTER TABLE "Article" ADD COLUMN "videoEmbedUrl" TEXT;
