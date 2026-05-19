import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { BreakingNews } from "@/components/home/BreakingNews";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { AdBanner } from "@/components/home/AdBanner";
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
import { listBreaking, listPublicArticles, timeAgo } from "@/lib/public-api";

// Pre-render the category routes that we know about at build time.
export async function generateStaticParams() {
  const cats = await getCategories();
  return cats.map((c) => ({ slug: c.slug }));
}

const FILTERS = ["Mais Recentes", "Mais Lidas", "Mais Comentadas"] as const;


export default async function CategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) notFound();

  const [{ items: rawArticles, total }, breaking] = await Promise.all([
    listPublicArticles({ category: slug, pageSize: 20 }),
    listBreaking(3),
  ]);
  const [featured, ...rest] = rawArticles;
  const articleCount = total;
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

      <AdBanner
        letter="M"
        title="Millennium BCP — Conta Ordenado sem comissões"
        description="Transfira o seu ordenado e ganhe até 4% de juro. Condições em millenniumbcp.pt"
        cta="Saber mais"
        palette="blue"
      />

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

              <Pagination current={1} total={5} />
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

      <AdBanner
        letter="V"
        title="Vodafone — Tarifário RED Ilimitado"
        description="Chamadas, SMS e dados ilimitados a partir de 24,99€/mês. Portabilidade grátis."
        cta="Ver tarifário"
        palette="red"
      />

      <SiteFooter />
    </div>
  );
}
