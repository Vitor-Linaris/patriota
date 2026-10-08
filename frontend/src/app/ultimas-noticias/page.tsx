import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { BreakingNews } from "@/components/home/BreakingNews";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { AdSlot } from "@/components/ads/AdSlot";
import { SiteFooter } from "@/components/home/SiteFooter";
import { Sidebar } from "@/components/home/Sidebar";
import { CategoryHero } from "@/components/category/CategoryHero";
import { ArticleListItem } from "@/components/category/ArticleListItem";
import { Pagination } from "@/components/category/Pagination";
import { SectionMarker } from "@/components/category/SectionMarker";
import {
  LISTING_PAGE_SIZE,
  pageFromParam,
  toListItem,
} from "@/lib/article-list";
import {
  getAdsByPage,
  listBreaking,
  listPublicArticles,
} from "@/lib/public-api";

export const metadata: Metadata = {
  title: "Últimas Notícias — O Patriota Notícias",
  description:
    "Todos os artigos publicados em O Patriota Notícias, do mais recente para o mais antigo.",
};

/**
 * Where the homepage's "Ver mais" under "Últimas Notícias" leads: every
 * published article, newest first, ten to a page.
 *
 * Uses the category page's furniture (masthead, list rows, pagination)
 * and the homepage's sidebar, with the listing-page ad slots.
 */
export default async function LatestNewsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = pageFromParam(pageParam);

  const [{ items, total }, breaking, ads] = await Promise.all([
    listPublicArticles({ page, pageSize: LISTING_PAGE_SIZE }),
    listBreaking(4),
    getAdsByPage("Categoria"),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / LISTING_PAGE_SIZE));
  // A page past the end is a link that no longer leads anywhere, not an
  // empty listing.
  if (page > totalPages) notFound();


  return (
    <div className="flex flex-1 flex-col bg-white text-slate-900">
      <TopBar />
      <BreakingNews
        items={breaking.map((a) => ({ slug: a.slug, title: a.title }))}
      />
      <SiteHeader />
      <SecondaryNav />

      <CategoryHero
        label="Últimas Notícias"
        description="Tudo o que publicámos, do mais recente para o mais antigo."
        trail={[{ label: "Início", href: "/" }, { label: "Últimas Notícias" }]}
        subsections={[]}
      />

      <AdSlot ad={ads["category-leaderboard"]} />

      <main className="bg-slate-50 py-10">
        <Container>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="col-span-1 lg:col-span-8">
              <SectionMarker
                title={page === 1 ? "Mais recentes" : `Página ${page}`}
              />
              <ul className="mt-5 flex flex-col gap-4">
                {items.length === 0 ? (
                  <li className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                    Ainda não existem artigos publicados.
                  </li>
                ) : (
                  items.map((a) => (
                    <li key={a.id}>
                      <ArticleListItem item={toListItem(a)} />
                    </li>
                  ))
                )}
              </ul>

              <Pagination
                current={page}
                totalPages={totalPages}
                hrefForPage={(p) =>
                  p === 1 ? "/ultimas-noticias" : `/ultimas-noticias?page=${p}`
                }
              />
            </div>

            <div className="col-span-1 lg:col-span-4">
              <Sidebar ad={ads["category-sidebar"]} />
            </div>
          </div>
        </Container>
      </main>

      <AdSlot ad={ads["category-prefooter"]} />

      <SiteFooter />
    </div>
  );
}
