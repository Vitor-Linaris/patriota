import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { BreakingNews } from "@/components/home/BreakingNews";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { SiteFooter } from "@/components/home/SiteFooter";
import { Pagination } from "@/components/category/Pagination";
import { CATEGORY_COLOR } from "@/components/home/HeroGrid";
import {
  listBreaking,
  listPublicArticles,
  timeAgo,
} from "@/lib/public-api";
import { imageVariant } from "@/lib/images";

export const metadata: Metadata = {
  title: "Pesquisa — O Patriota Notícias",
  description: "Resultados da pesquisa em O Patriota Notícias.",
};

const PAGE_SIZE = 10;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q: qParam, page: pageParam } = await searchParams;
  const q = (qParam ?? "").trim();
  const page = Math.max(1, Number(pageParam) || 1);

  const [{ items, total }, breaking] = await Promise.all([
    q
      ? listPublicArticles({ q, page, pageSize: PAGE_SIZE })
      : Promise.resolve({ items: [], total: 0 }),
    listBreaking(4),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="flex flex-1 flex-col bg-white text-slate-900">
      <TopBar />
      <BreakingNews
        items={breaking.map((a) => ({ slug: a.slug, title: a.title }))}
      />
      <SiteHeader />
      <SecondaryNav />

      <main className="bg-slate-50 py-10">
        <Container>
          {/* Header */}
          <header className="mb-8 max-w-3xl">
            <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">
              Pesquisa
            </p>
            <h1 className="mt-1 text-[32px] font-black leading-tight text-slate-900">
              {q ? <>Resultados para “{q}”</> : "Pesquisar"}
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              {q
                ? `${total.toLocaleString("pt-PT")} ${total === 1 ? "artigo encontrado" : "artigos encontrados"}`
                : "Use o campo de pesquisa no topo do site para procurar artigos."}
            </p>
          </header>

          {/* Inline search form so users can refine without going
              back to the modal. */}
          <form
            action="/pesquisa"
            method="get"
            className="mb-8 flex max-w-2xl gap-2"
          >
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="O que procura?"
              className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[15px] transition-colors focus:border-patriota-medium focus:outline-none focus:ring-2 focus:ring-patriota-medium/20"
            />
            <button
              type="submit"
              className="rounded-xl bg-patriota-dark px-6 py-3 text-[14px] font-bold text-white transition-colors hover:bg-patriota-medium"
            >
              Pesquisar
            </button>
          </form>

          {/* Results */}
          {q && items.length === 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
              <p className="text-[18px] font-bold text-slate-700">
                Nenhum artigo encontrado.
              </p>
              <p className="mt-2 text-sm text-slate-500">
                Tente outros termos ou veja as{" "}
                <Link
                  href="/"
                  className="font-semibold text-patriota-medium underline-offset-2 hover:underline"
                >
                  últimas notícias
                </Link>
                .
              </p>
            </div>
          )}

          {items.length > 0 && (
            <>
              <ul className="flex max-w-3xl flex-col gap-4">
                {items.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/artigo/${item.slug}`}
                      className="group flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition-all duration-300 hover:-translate-y-0.5 hover:border-patriota-medium hover:shadow-lg"
                    >
                      {item.coverImageUrl ? (
                        <div className="hidden h-20 w-28 shrink-0 overflow-hidden rounded-md sm:block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={
                              imageVariant(item.coverImageUrl, "medium") ??
                              item.coverImageUrl
                            }
                            alt=""
                            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                          />
                        </div>
                      ) : (
                        <div className="hidden h-20 w-28 shrink-0 rounded-md bg-gradient-to-br from-slate-200 to-slate-300 sm:block" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span
                            className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ${CATEGORY_COLOR[item.category.name] ?? "bg-slate-600"}`}
                          >
                            {item.category.name}
                          </span>
                          <span aria-hidden>·</span>
                          <span>{timeAgo(item.publishedAt)}</span>
                          <span aria-hidden>·</span>
                          <span>{item.readMinutes} min leitura</span>
                        </div>
                        <h3 className="mt-2 text-[16px] font-bold leading-snug text-slate-900 transition-colors duration-200 group-hover:text-patriota-medium">
                          {item.title}
                        </h3>
                        {item.summary && (
                          <p className="mt-1 line-clamp-2 text-[13px] text-slate-600">
                            {item.summary}
                          </p>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>

              {totalPages > 1 && (
                <div className="mt-8 max-w-3xl">
                  <Pagination
                    current={page}
                    totalPages={totalPages}
                    hrefForPage={(p) =>
                      `/pesquisa?q=${encodeURIComponent(q)}${p > 1 ? `&page=${p}` : ""}`
                    }
                  />
                </div>
              )}
            </>
          )}
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
