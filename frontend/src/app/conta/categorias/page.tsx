import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
import { readerApiFetch, requireReader } from "@/lib/reader-api";
import { ContaShell, EmptyState } from "../ContaShell";
import { CategoryToggles, type FollowedCategory } from "./CategoryToggles";

export const metadata = {
  title: "Categorias que sigo — O Patriota Notícias",
  robots: { index: false, follow: false },
};

export default async function CategoriasPage() {
  if (!FEATURES.readerArea) notFound();
  await requireReader("/conta/categorias");

  const res = await readerApiFetch("/reader/favorites/categories");
  const items = res && res.ok ? ((await res.json()) as FollowedCategory[]) : [];

  return (
    <ContaShell
      active="/conta/categorias"
      title="Categorias que sigo"
      subtitle="Receba um e-mail quando sair uma notícia nova nestes temas."
    >
      {items.length > 0 && (
        // Says what the follow actually does now. Seguir "Portugal"
        // passou a trazer o que sai no Funchal e na Sé, e um leitor que
        // não soubesse disso leria os e-mails extra como spam.
        <p className="mb-5 rounded-[8px] border border-slate-200 bg-slate-50 px-4 py-3 text-[13px] leading-relaxed text-slate-600">
          Seguir uma secção inclui as suas subsecções. Quem segue{" "}
          <strong className="font-semibold text-slate-800">Portugal</strong>{" "}
          recebe também o que sai em Portugal › Madeira › Funchal. Para
          receber apenas um tema mais específico, siga essa subsecção
          directamente.
        </p>
      )}
      {items.length === 0 ? (
        <EmptyState
          glyph="☆"
          title="Ainda não segue nenhuma categoria"
          body="Use o botão “Seguir” no topo de qualquer notícia para acompanhar o tema."
          cta={
            <Link
              href="/"
              className="inline-block rounded-[8px] bg-patriota-pure px-4 py-2 text-[13px] font-bold text-white transition hover:brightness-110"
            >
              Explorar categorias
            </Link>
          }
        />
      ) : (
        <CategoryToggles initial={items} />
      )}
    </ContaShell>
  );
}
