-- Video in the media library.
--
-- Stored as it arrived, not transcoded. A real conversion takes minutes
-- and cannot live inside an HTTP request; the newsroom uploads MP4/H.264
-- or WebM and anything else is refused with a message saying what to
-- export instead.
CREATE TYPE "MediaKind" AS ENUM ('IMAGEM', 'VIDEO');

-- Everything that already exists is an image: video could not be
-- uploaded before this migration.
ALTER TABLE "Media"
  ADD COLUMN "kind" "MediaKind" NOT NULL DEFAULT 'IMAGEM',
  ADD COLUMN "durationSeconds" INTEGER,
  ADD COLUMN "posterUrl" TEXT;
