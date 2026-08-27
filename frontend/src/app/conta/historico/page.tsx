import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
import { readerApiFetch, requireReader } from "@/lib/reader-api";
import { ContaShell, EmptyState } from "../ContaShell";
import { ArticleRow, type ReaderArticleCard } from "../ArticleRow";
import { ClearHistoryButton } from "./ClearHistoryButton";

export const metadata = {
  title: "Histórico de leitura — O Patriota Notícias",
  robots: { index: false, follow: false },
};

interface HistoryEntry extends ReaderArticleCard {
  lastReadAt: string;
  readCount: number;
}

export default async function HistoricoPage() {
  if (!FEATURES.readerArea) notFound();
  await requireReader("/conta/historico");

  const res = await readerApiFetch("/reader/history?pageSize=50");
  const data =
    res && res.ok
      ? ((await res.json()) as { items: HistoryEntry[]; total: number })
      : { items: [], total: 0 };

  return (
    <ContaShell
      active="/conta/historico"
      title="Histórico de leitura"
      subtitle={`${data.total} ${data.total === 1 ? "notícia lida" : "notícias lidas"}`}
      action={data.total > 0 ? <ClearHistoryButton /> : undefined}
    >
      {data.items.length === 0 ? (
        <EmptyState
          glyph="◷"
          title="Ainda não há histórico"
          body="À medida que for lendo, as notícias aparecem aqui por ordem cronológica."
          cta={
            <Link
              href="/"
              className="inline-block rounded-[8px] bg-patriota-pure px-4 py-2 text-[13px] font-bold text-white transition hover:brightness-110"
            >
              Começar a ler
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((a) => (
            <li key={a.id}>
              <ArticleRow
                article={a}
                meta={a.readCount > 1 ? `lida ${a.readCount}×` : undefined}
              />
            </li>
          ))}
        </ul>
      )}
    </ContaShell>
  );
}
