import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { BreakingNews } from "@/components/home/BreakingNews";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { AdSlot } from "@/components/ads/AdSlot";
import { SiteFooter } from "@/components/home/SiteFooter";
import { CategoryHero } from "@/components/category/CategoryHero";
import { ArticleListItem } from "@/components/category/ArticleListItem";
import { Pagination } from "@/components/category/Pagination";
import { CategorySidebar } from "@/components/category/CategorySidebar";
import { SectionMarker } from "@/components/category/SectionMarker";
import {
  SortTabs,
  parseSort,
  sortQuery,
  type SortKey,
} from "@/components/category/SortTabs";
import { getAncestors, getCategoryBySlug } from "@/lib/categories";
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

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return { title: "Rubrica não encontrada — O Patriota Notícias" };
  return {
    title: `Todos os artigos de ${category.label} — O Patriota Notícias`,
    description: `Todos os artigos publicados em ${category.label}.`,
  };
}

/**
 * Every article in a category, ten to a page — where the "Ver mais" on
 * the category's front page leads. Keeps the same sort tabs, so "Mais
 * Lidas → Ver mais" carries on in that order.
 */
export default async function CategoryAllPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string; sort?: string }>;
}) {
  const { slug } = await params;
  const { page: pageParam, sort: sortParam } = await searchParams;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const page = pageFromParam(pageParam);
  const sort = parseSort(sortParam);

  const [{ items, total }, breaking, ads, trail] = await Promise.all([
    listPublicArticles({
      category: slug,
      page,
      pageSize: LISTING_PAGE_SIZE,
      sort,
    }),
    listBreaking(4),
    getAdsByPage("Categoria"),
    getAncestors(slug),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / LISTING_PAGE_SIZE));
  // A page past the end is a dead link, not an empty listing.
  if (page > totalPages) notFound();

  const offset = (page - 1) * LISTING_PAGE_SIZE;
  const base = `/categoria/${slug}/todos`;
  const hrefFor = (p: number, s: SortKey = sort) => {
    const qs = new URLSearchParams(sortQuery(s));
    if (p !== 1) qs.set("page", String(p));
    const q = qs.toString();
    return q ? `${base}?${q}` : base;
  };

  return (
    <div className="flex flex-1 flex-col bg-white text-slate-900">
      <TopBar />
      <BreakingNews
        items={breaking.map((a) => ({ slug: a.slug, title: a.title }))}
      />
      <SiteHeader />
      <SecondaryNav />

      <CategoryHero
        label={category.label}
        description={category.description}
        trail={[
          { label: "Início", href: "/" },
          // Every level links back now, the category itself included —
          // this page sits one step below it.
          ...trail.map((c) => ({
            label: c.label,
            href: `/categoria/${c.slug}`,
          })),
          { label: "Todos os artigos" },
        ]}
        subsections={category.children}
      />

      <AdSlot ad={ads["category-leaderboard"]} />

      <main className="bg-slate-50 py-10">
        <Container>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="col-span-1 lg:col-span-8">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <SectionMarker
                  title={
                    page === 1 ? "Todos os artigos" : `Todos os artigos · página ${page}`
                  }
                />
                {/* A new order starts again from page 1. */}
                <SortTabs active={sort} hrefFor={(key) => hrefFor(1, key)} />
              </div>

              <ul className="mt-5 flex flex-col gap-4">
                {items.length === 0 ? (
                  <li className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                    Ainda não existem artigos publicados nesta rubrica.
                  </li>
                ) : (
                  items.map((a, i) => (
                    <li key={a.id}>
                      <ArticleListItem item={toListItem(a, offset + i + 1)} />
                    </li>
                  ))
                )}
              </ul>

              <Pagination
                current={page}
                totalPages={totalPages}
                hrefForPage={(p) => hrefFor(p)}
              />
            </div>

            <div className="col-span-1 lg:col-span-4">
              <CategorySidebar
                currentSlug={category.slug}
                newsletterTitle={`Receba o melhor de ${category.label}`}
                ad={ads["category-sidebar"]}
              />
            </div>
          </div>
        </Container>
      </main>

      <AdSlot ad={ads["category-prefooter"]} />

      <SiteFooter />
    </div>
  );
}
