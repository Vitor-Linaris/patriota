import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
import { readerApiFetch, requireReader } from "@/lib/reader-api";
import { ContaShell, EmptyState } from "../ContaShell";
import { CategoryPicker, type PickableCategory } from "./CategoryPicker";

export const metadata = {
  title: "Categorias que sigo — O Patriota Notícias",
  robots: { index: false, follow: false },
};

export default async function CategoriasPage() {
  if (!FEATURES.readerArea) notFound();
  await requireReader("/conta/categorias");

  // The whole catalogue, with what this reader has chosen on each row —
  // not just what they already follow. The page used to list only their
  // follows and, to anybody following nothing, point them back at an
  // article to find the button, which is a strange way to offer
  // something.
  const res = await readerApiFetch("/reader/categories");
  const items =
    res && res.ok ? ((await res.json()) as PickableCategory[]) : [];

  return (
    <ContaShell
      active="/conta/categorias"
      title="Categorias que sigo"
      subtitle="Escolha os temas que quer acompanhar e se quer receber e-mail."
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
        // Only when the newsroom is offering nothing at all — a fresh
        // install, or every section still under review. Nothing the
        // reader can do about it, so it does not pretend otherwise.
        <EmptyState
          glyph="☆"
          title="Ainda não há secções para seguir"
          body="Assim que a redacção abrir as primeiras secções, aparecem aqui para escolher."
        />
      ) : (
        <CategoryPicker initial={items} />
      )}
    </ContaShell>
  );
}
