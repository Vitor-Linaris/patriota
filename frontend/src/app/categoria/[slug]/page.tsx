import { notFound, redirect } from "next/navigation";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { BreakingNews } from "@/components/home/BreakingNews";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { AdSlot } from "@/components/ads/AdSlot";
import { SiteFooter } from "@/components/home/SiteFooter";
import { CategoryHero } from "@/components/category/CategoryHero";
import { FeaturedArticle } from "@/components/category/FeaturedArticle";
import { ArticleListItem } from "@/components/category/ArticleListItem";
import { CategorySidebar } from "@/components/category/CategorySidebar";
import { SectionMarker } from "@/components/category/SectionMarker";
import {
  SortTabs,
  parseSort,
  sortQuery,
} from "@/components/category/SortTabs";
import { SeeMoreLink } from "@/components/SeeMoreLink";
import {
  getAllCategories,
  getAncestors,
  getCategoryBySlug,
} from "@/lib/categories";
import { PREVIEW_COUNT, initialsOf, toListItem } from "@/lib/article-list";
import {
  getAdsByPage,
  listBreaking,
  listPublicArticles,
  timeAgo,
} from "@/lib/public-api";

// Pre-render the category routes that we know about at build time.
// Every level, not just the roots — a subtópico has its own page and
// its own URL, and leaving it out would make the deepest pages the only
// ones rendered on demand.
export async function generateStaticParams() {
  const cats = await getAllCategories();
  return cats.map((c) => ({ slug: c.slug }));
}

/**
 * The section's front page: one featured article and the next eight.
 * Beyond that, "Ver mais" leads to /categoria/<slug>/todos — the full,
 * paginated list.
 */
export default async function CategoryPage({
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

  const sort = parseSort(sortParam);

  // This page used to paginate itself (?page=2…). Those links — shared,
  // bookmarked, indexed — now belong to the full listing.
  if (pageParam && pageParam !== "1") {
    const qs = new URLSearchParams(sortQuery(sort));
    qs.set("page", pageParam);
    redirect(`/categoria/${slug}/todos?${qs.toString()}`);
  }

  // The featured one plus the eight under it.
  const shown = 1 + PREVIEW_COUNT;
  const [{ items: rawArticles, total }, breaking, ads, trail] =
    await Promise.all([
      listPublicArticles({ category: slug, page: 1, pageSize: shown, sort }),
      listBreaking(4),
      getAdsByPage("Categoria"),
      getAncestors(slug),
    ]);
  const featured = rawArticles[0] ?? null;
  const listItems = rawArticles.slice(1).map((a) => toListItem(a));
  const hasMore = total > shown;
  const allHref = `/categoria/${slug}/todos${sortQuery(sort) ? `?${sortQuery(sort)}` : ""}`;

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
          ...trail.map((c, i) => ({
            label: c.label,
            // The current category is the last crumb and gets no link.
            href: i === trail.length - 1 ? undefined : `/categoria/${c.slug}`,
          })),
        ]}
        subsections={category.children}
      />

      <AdSlot ad={ads["category-leaderboard"]} />

      <main className="bg-slate-50 py-10">
        <Container>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
            {/* Articles column */}
            <div className="col-span-1 lg:col-span-8">
              {featured && (
                <>
                  <SectionMarker title="Artigo em Destaque" />
                  <div className="mt-5">
                    <FeaturedArticle
                      category={featured.category.name}
                      title={featured.title}
                      excerpt={featured.summary}
                      author={{
                        initials: initialsOf(featured.author.name),
                        name: featured.author.name ?? "Redação",
                      }}
                      publishedAt={timeAgo(featured.publishedAt)}
                      time={timeAgo(featured.publishedAt)}
                      readMinutes={featured.readMinutes}
                      coverImageUrl={featured.coverImageUrl}
                      slug={featured.slug}
                    />
                  </div>
                </>
              )}

              {/* List header */}
              <div className="mt-10 flex flex-wrap items-center justify-between gap-4">
                <SectionMarker title="Todos os artigos" />
                <SortTabs
                  active={sort}
                  hrefFor={(key) => {
                    const qs = sortQuery(key);
                    return `/categoria/${slug}${qs ? `?${qs}` : ""}`;
                  }}
                />
              </div>

              {/* List */}
              <ul className="mt-5 flex flex-col gap-4">
                {listItems.length === 0 ? (
                  <li className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                    {featured
                      ? // The only article there is has just been shown
                        // above as the featured one — saying "there are
                        // none" right under it reads as a bug.
                        "Não há mais artigos nesta secção, para já."
                      : "Ainda não existem artigos publicados nesta rubrica."}
                  </li>
                ) : (
                  listItems.map((a) => (
                    <li key={a.slug}>
                      <ArticleListItem item={a} />
                    </li>
                  ))
                )}
              </ul>

              {hasMore && (
                <SeeMoreLink href={allHref} label="Ver mais artigos" />
              )}
            </div>

            {/* Sidebar */}
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
