import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { BreakingNews } from "@/components/home/BreakingNews";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { AdSlot } from "@/components/ads/AdSlot";
import { SiteFooter } from "@/components/home/SiteFooter";
import { CategoryHero } from "@/components/category/CategoryHero";
import { FeaturedArticle } from "@/components/category/FeaturedArticle";
import {
  ArticleListItem,
  type ArticleListItemData,
} from "@/components/category/ArticleListItem";
import { Pagination } from "@/components/category/Pagination";
import { CategorySidebar } from "@/components/category/CategorySidebar";
import { SectionMarker } from "@/components/category/SectionMarker";
import { getCategoryBySlug, getCategories } from "@/lib/categories";
import {
  getAdsByPage,
  listBreaking,
  listPublicArticles,
  timeAgo,
} from "@/lib/public-api";

// Pre-render the category routes that we know about at build time.
export async function generateStaticParams() {
  const cats = await getCategories();
  return cats.map((c) => ({ slug: c.slug }));
}

const FILTERS = ["Mais Recentes", "Mais Lidas", "Mais Comentadas"] as const;


const PAGE_SIZE = 10;

export default async function CategoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { slug } = await params;
  const { page: pageParam } = await searchParams;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  // 1-based, clamp to a sane lower bound.
  const page = Math.max(1, Number(pageParam) || 1);

  const [{ items: rawArticles, total }, breaking, ads] = await Promise.all([
    listPublicArticles({ category: slug, page, pageSize: PAGE_SIZE }),
    listBreaking(3),
    getAdsByPage("Categoria"),
  ]);
  // Only treat the first article as "featured" on page 1 — otherwise
  // page 2+ would have a confusing oversized card from the middle of
  // the list.
  const featuredOnly = page === 1 && rawArticles.length > 0;
  const featured = featuredOnly ? rawArticles[0] : null;
  const rest = featuredOnly ? rawArticles.slice(1) : rawArticles;
  const articleCount = total;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const listItems = rest.map((a, i) => ({
    number: i + 1,
    category: a.category.name.toUpperCase(),
    time: timeAgo(a.publishedAt),
    readMinutes: a.readMinutes,
    title: a.title,
    excerpt: a.summary,
    authorInitials: (a.author.name ?? "??")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase() ?? "")
      .join(""),
    authorName: a.author.name ?? "Redação",
    date: timeAgo(a.publishedAt),
    slug: a.slug,
    coverImageUrl: a.coverImageUrl,
  }));

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
        subtopics={category.subtopics}
        articleCount={articleCount}
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
                        initials: (featured.author.name ?? "??")
                          .split(" ")
                          .filter(Boolean)
                          .slice(0, 2)
                          .map((n) => n[0]?.toUpperCase() ?? "")
                          .join(""),
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
                <SectionMarker
                  title="Todos os artigos"
                  trailing={
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-[12px] font-semibold text-slate-700">
                      {articleCount} artigos
                    </span>
                  }
                />
                <div
                  role="tablist"
                  aria-label="Ordenar artigos"
                  className="inline-flex rounded-lg border border-slate-200 bg-white p-1 text-[13px]"
                >
                  {FILTERS.map((f, i) => (
                    <button
                      key={f}
                      role="tab"
                      aria-selected={i === 0}
                      className={
                        "rounded-md px-3 py-1.5 font-semibold transition " +
                        (i === 0
                          ? "bg-patriota-dark text-white"
                          : "text-slate-600 hover:text-slate-900")
                      }
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {/* List */}
              <ul className="mt-5 flex flex-col gap-4">
                {listItems.length === 0 ? (
                  <li className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500">
                    Ainda não existem artigos publicados nesta rubrica.
                  </li>
                ) : (
                  listItems.map((a) => (
                    <li key={a.slug}>
                      <ArticleListItem item={a} />
                    </li>
                  ))
                )}
              </ul>

              <Pagination
                current={page}
                totalPages={totalPages}
                hrefForPage={(p) =>
                  p === 1
                    ? `/categoria/${slug}`
                    : `/categoria/${slug}?page=${p}`
                }
              />
            </div>

            {/* Sidebar */}
            <div className="col-span-1 lg:col-span-4">
              <CategorySidebar
                currentSlug={category.slug}
                newsletterTitle={`Receba o melhor de ${category.label}`}
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
