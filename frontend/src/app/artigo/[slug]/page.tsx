import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { BreakingNews } from "@/components/home/BreakingNews";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { AdSlot } from "@/components/ads/AdSlot";
import { SiteFooter } from "@/components/home/SiteFooter";
import { EssentialBox } from "@/components/article/EssentialBox";
import { ContextBox } from "@/components/article/ContextBox";
import { Blockquote } from "@/components/article/Blockquote";
import { AuthorBio } from "@/components/article/AuthorBio";
import { ArticleSidebar } from "@/components/article/ArticleSidebar";
import { ShareButtons, ICON_BUTTON } from "@/components/article/ShareButtons";
import { ReaderActions } from "@/components/article/ReaderActions";
import { ArticleComments } from "@/components/article/ArticleComments";
import { Paywall } from "@/components/article/Paywall";
import { VideoEmbed } from "@/components/article/VideoEmbed";
import { Breadcrumb } from "@/components/Breadcrumb";
import { getAncestors } from "@/lib/categories";
import { FEATURES } from "@/lib/features";
import { getReaderToken } from "@/lib/reader-api";
import { imageVariant } from "@/lib/images";
import {
  getAdsByPage,
  getArticleBySlug,
  listBreaking,
  listRelated,
  timeAgo,
} from "@/lib/public-api";

export default async function ArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await getArticleBySlug(slug);
  if (!article) notFound();
  const [related, breaking, ads, trail] = await Promise.all([
    listRelated(slug, 4),
    listBreaking(4),
    getAdsByPage("Artigo"),
    getAncestors(article.category.slug),
  ]);
  // Built from the configured site URL rather than window.location so
  // what gets shared is always the canonical address, whichever host
  // the reader happened to arrive on.
  const shareUrl = `${
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.opatriota.pt"
  }/artigo/${article.slug}`;

  const body = article.content ?? article.contentPreview ?? "";
  const signedIn = (await getReaderToken()) !== null;

  /**
   * NewsArticle, declaring the piece as subscription content.
   *
   * Not optional politeness. Serving a crawler a cut version of what a
   * subscriber sees is cloaking unless the page says so in the way
   * Google reads — `isAccessibleForFree: false` plus a `hasPart` naming
   * the CSS selector of the withheld section. Without it, a paywalled
   * site risks being demoted for the exact behaviour the paywall exists
   * to perform. The selector must match the class on <Paywall />.
   */
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    headline: article.title,
    description: article.metaDescription ?? article.summary,
    datePublished: article.publishedAt ?? undefined,
    author: article.author.name
      ? { "@type": "Person", name: article.author.name }
      : undefined,
    articleSection: article.category.name,
    mainEntityOfPage: { "@type": "WebPage", "@id": shareUrl },
    ...(article.coverImageUrl ? { image: [article.coverImageUrl] } : {}),
    isAccessibleForFree: !article.paywalled,
    ...(article.paywalled
      ? {
          hasPart: {
            "@type": "WebPageElement",
            isAccessibleForFree: false,
            cssSelector: ".paywall-cut",
          },
        }
      : {}),
  };

  const authorInitials = (article.author.name ?? "??")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex flex-1 flex-col bg-white text-slate-900">
      <script
        type="application/ld+json"
        // Same pattern as <Breadcrumb />. JSON.stringify of a plain
        // object we built ourselves, never reader input.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd) }}
      />
      <TopBar />
      <BreakingNews
        items={breaking.map((a) => ({ slug: a.slug, title: a.title }))}
      />
      <SiteHeader />
      <SecondaryNav />

      <AdSlot ad={ads["article-leaderboard"]} />

      <main className="bg-white py-10">
        <Container>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Article column */}
            <article className="col-span-1 lg:col-span-8">
              {/* Breadcrumb — the full ancestry, and the JSON-LD with
                  it. Article pages are what rank, and with flat URLs
                  this markup is the only thing that tells a crawler the
                  piece sits four levels down rather than at the top. */}
              <Breadcrumb
                items={[
                  { label: "Início", href: "/" },
                  ...(trail.length > 0
                    ? trail
                    : [
                        // The category is not in the public tree (hidden,
                        // or the tree failed to load). Better a two-level
                        // trail than none.
                        {
                          slug: article.category.slug,
                          label: article.category.name,
                        },
                      ]
                  ).map((c) => ({
                    label: c.label,
                    href: `/categoria/${c.slug}`,
                  })),
                  { label: article.title },
                ]}
              />

              {/* Category + topic */}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <span className="inline-flex rounded-[4px] bg-patriota-medium px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-white">
                  {article.category.name}
                </span>
              </div>

              {/* Headline */}
              <h1 className="mt-4 text-[32px] font-black leading-[1.15] text-slate-900 md:text-[42px] md:leading-[1.1]">
                {article.title}
              </h1>

              {/* Lead */}
              {article.summary && (
                <p className="mt-6 border-l-4 border-patriota-accent pl-5 text-[18px] leading-relaxed text-slate-700">
                  {article.summary}
                </p>
              )}

              {/*
                Author row. Everything actionable sits on the right as
                bare icons — the labels were noise on a line that already
                carries a byline, a date and a reading time. Each control
                keeps aria-label and title, so the meaning survives for
                screen readers and on hover.
              */}
              <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 border-y border-slate-200 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-patriota-pure text-[13px] font-bold text-patriota-accent">
                  {authorInitials}
                </span>
                <div className="min-w-0">
                  <p className="text-[14px] font-bold text-slate-900">
                    {article.author.name ?? "Redação"}
                  </p>
                  <p className="text-[12px] text-slate-500">
                    {timeAgo(article.publishedAt)} · {article.readMinutes} min leitura
                  </p>
                </div>

                <div className="ml-auto flex items-center gap-1.5">
                  {/*
                    The comment counter is a real anchor, not a button: it
                    works with JS disabled, it is shareable, and the browser
                    does the scrolling. The number comes from the SSR
                    payload, so it costs no extra request.
                  */}
                  {FEATURES.comments && (
                    <a
                      href="#comentarios"
                      aria-label={
                        article.commentCount === 1
                          ? "1 comentário"
                          : article.commentCount + " comentários"
                      }
                      title={
                        article.commentCount === 1
                          ? "1 comentário"
                          : article.commentCount + " comentários"
                      }
                      className={`${ICON_BUTTON} border-patriota-medium/40 text-[12px] font-bold text-patriota-medium`}
                    >
                      {article.commentCount > 99 ? "99+" : article.commentCount}
                    </a>
                  )}

                  {FEATURES.readerArea && (
                    <ReaderActions
                      articleId={article.id}
                      slug={article.slug}
                    />
                  )}

                  <span aria-hidden className="mx-1 h-5 w-px bg-slate-200" />

                  <ShareButtons url={shareUrl} title={article.title} />
                </div>
              </div>

              {/* Essential */}
              {article.essentials && article.essentials.length > 0 && (
                <div className="mt-8">
                  <EssentialBox items={article.essentials} />
                </div>
              )}

              {/* Cover image, if any */}
              {article.coverImageUrl && (
                <figure className="mt-8">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageVariant(article.coverImageUrl, "large") ?? article.coverImageUrl}
                    alt={article.title}
                    className="aspect-[16/9] w-full rounded-lg object-cover"
                  />
                </figure>
              )}

              {article.videoEmbedUrl && (
                <VideoEmbed url={article.videoEmbedUrl} />
              )}

              {/* Body.
                  `content ?? contentPreview` and not a check for an empty
                  string: on a withheld exclusive `content` is absent from
                  the payload entirely, which is what makes this pair
                  safe to read in that order. */}
              {body ? (
                <div
                  className="prose prose-slate mt-8 max-w-none text-[16px] leading-relaxed text-slate-800 [&_p]:mt-4"
                  dangerouslySetInnerHTML={{ __html: body }}
                />
              ) : (
                <p className="mt-8 text-[16px] leading-relaxed text-slate-800">
                  {article.summary}
                </p>
              )}

              {article.paywalled && (
                <Paywall
                  signedIn={signedIn}
                  billingLive={FEATURES.billing}
                  returnTo={`/artigo/${article.slug}`}
                />
              )}

              {/* Context */}
              {article.context &&
                article.context.columns &&
                article.context.columns.length > 0 && (
                  <div className="mt-8">
                    <ContextBox columns={article.context.columns} />
                  </div>
                )}

              {/* Blockquote */}
              {article.pullQuote &&
                article.pullQuote.quote &&
                article.pullQuote.quote.length > 0 && (
                  <div className="mt-8">
                    <Blockquote
                      quote={article.pullQuote.quote}
                      cite={article.pullQuote.cite}
                    />
                  </div>
                )}

              {/* Transparency notice */}
              <div className="mt-10 rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-[13px] leading-relaxed text-amber-900">
                <strong className="font-bold">
                  Política de transparência:
                </strong>{" "}
                este artigo segue as orientações editoriais do Patriota.
                Quaisquer correcções relevantes são registadas no rodapé.
              </div>

              {/* In-content ad (article-incontent, 336×280 IAB Large
                  Rectangle). Centred between the body and the author
                  bio so it doesn't break the reading flow mid-paragraph. */}
              <div className="mt-10 flex justify-center">
                <AdSlot ad={ads["article-incontent"]} variant="none" />
              </div>

              {/* Author bio */}
              <div className="mt-10">
                <AuthorBio
                  initials={authorInitials}
                  name={article.author.name ?? "Redação"}
                  role="O Patriota Notícias"
                  bio="Jornalista da equipa editorial do O Patriota."
                />
              </div>

              {/* Comments — server-rendered, so they are indexable and
                  carry no third-party JavaScript. */}
              {FEATURES.comments && (
                <ArticleComments
                  slug={article.slug}
                  totalHint={article.commentCount}
                />
              )}

              {/* Related articles */}
              {related.length > 0 && (
                <section className="mt-12 border-t border-slate-200 pt-8">
                  <h2 className="text-[20px] font-black uppercase tracking-wide text-slate-900">
                    Continuar a ler
                  </h2>
                  <ul className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                    {related.map((r) => (
                      <li key={r.id}>
                        <Link
                          href={`/artigo/${r.slug}`}
                          className="group block overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:border-patriota-medium hover:shadow-[0_6px_20px_-8px_rgba(15,44,107,0.18)]"
                        >
                          {r.coverImageUrl && (
                            <div className="aspect-[16/9] w-full overflow-hidden">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={
                                  imageVariant(r.coverImageUrl, "small") ??
                                  r.coverImageUrl
                                }
                                alt=""
                                className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                              />
                            </div>
                          )}
                          <div className="p-4">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-orange-600">
                              {r.category.name}
                            </p>
                            <h3 className="mt-1 text-[16px] font-bold leading-snug text-slate-900 transition-colors duration-200 group-hover:text-patriota-medium">
                              {r.title}
                            </h3>
                            {r.summary && (
                              <p className="mt-2 line-clamp-2 text-[13px] text-slate-600">
                                {r.summary}
                              </p>
                            )}
                          </div>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </article>

            {/* Sidebar */}
            <div className="col-span-1 lg:col-span-4">
              <ArticleSidebar
                ad={ads["article-sidebar"]}
                adBelowNewsletter={ads["article-sidebar-bottom"]}
              />
            </div>
          </div>
        </Container>
      </main>

      <AdSlot ad={ads["article-prefooter"]} />

      <SiteFooter stickyAd={ads["article-sticky"]} />
    </div>
  );
}

