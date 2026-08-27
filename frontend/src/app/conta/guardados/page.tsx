import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
import { readerApiFetch, requireReader } from "@/lib/reader-api";
import { ContaShell, EmptyState } from "../ContaShell";
import { ArticleRow, type ReaderArticleCard } from "../ArticleRow";

export const metadata = {
  title: "Notícias guardadas — O Patriota Notícias",
  robots: { index: false, follow: false },
};

export default async function GuardadosPage() {
  if (!FEATURES.readerArea) notFound();
  await requireReader("/conta/guardados");

  const res = await readerApiFetch("/reader/favorites/articles?pageSize=50");
  const data =
    res && res.ok
      ? ((await res.json()) as { items: ReaderArticleCard[]; total: number })
      : { items: [], total: 0 };

  return (
    <ContaShell
      active="/conta/guardados"
      title="Notícias guardadas"
      subtitle={
        data.total === 1
          ? "1 notícia guardada"
          : `${data.total} notícias guardadas`
      }
    >
      {data.items.length === 0 ? (
        <EmptyState
          glyph="♡"
          title="Ainda não guardou nenhuma notícia"
          body="Use o coração no topo de qualquer notícia para a guardar e voltar a ela mais tarde."
          cta={
            <Link
              href="/"
              className="inline-block rounded-[8px] bg-patriota-pure px-4 py-2 text-[13px] font-bold text-white transition hover:brightness-110"
            >
              Ver as últimas notícias
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((a) => (
            <li key={a.id}>
              <ArticleRow article={a} />
            </li>
          ))}
        </ul>
      )}
    </ContaShell>
  );
}
