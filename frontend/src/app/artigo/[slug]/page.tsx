import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { BreakingNews } from "@/components/home/BreakingNews";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { AdBanner } from "@/components/home/AdBanner";
import { SiteFooter } from "@/components/home/SiteFooter";
import { EssentialBox } from "@/components/article/EssentialBox";
import { ContextBox } from "@/components/article/ContextBox";
import { Blockquote } from "@/components/article/Blockquote";
import { AuthorBio } from "@/components/article/AuthorBio";
import { ArticleSidebar } from "@/components/article/ArticleSidebar";
import {
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
  const [related, breaking] = await Promise.all([
    listRelated(slug, 4),
    listBreaking(3),
  ]);
  const authorInitials = (article.author.name ?? "??")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <div className="flex flex-1 flex-col bg-white text-slate-900">
      <TopBar />
      <BreakingNews
        items={breaking.map((a) => ({ slug: a.slug, title: a.title }))}
      />
      <SiteHeader />
      <SecondaryNav />

      <AdBanner
        letter="M"
        title="Millennium BCP — Conta Ordenado sem comissões"
        description="Transfira o seu ordenado e ganhe até 4% de juro. Condições em millenniumbcp.pt"
        cta="Saber mais"
        palette="blue"
      />

      <main className="bg-white py-10">
        <Container>
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:gap-12">
            {/* Article column */}
            <article className="col-span-1 lg:col-span-8">
              {/* Breadcrumb */}
              <nav
                aria-label="Breadcrumb"
                className="flex items-center gap-2 text-[13px] text-slate-500"
              >
                <Link href="/" className="hover:text-slate-900">
                  Início
                </Link>
                <span aria-hidden>/</span>
                <Link
                  href={`/categoria/${article.category.slug}`}
                  className="hover:text-slate-900"
                >
                  {article.category.name}
                </Link>
              </nav>

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

              {/* Author + share */}
              <div className="mt-8 flex flex-wrap items-center gap-4 border-y border-slate-200 py-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-patriota-pure text-[13px] font-bold text-patriota-accent">
                  {authorInitials}
                </span>
                <div className="flex-1">
                  <p className="text-[14px] font-bold text-slate-900">
                    {article.author.name ?? "Redação"}
                  </p>
                  <p className="text-[12px] text-slate-500">O Patriota Notícias</p>
                </div>
                <div className="text-right text-[12px] leading-relaxed text-slate-500">
                  <p>{timeAgo(article.publishedAt)}</p>
                  <p>{article.readMinutes} min leitura</p>
                </div>
                <div className="flex gap-2">
                  <ShareButton aria="Partilhar no Facebook" glyph="f" />
                  <ShareButton aria="Partilhar no X" glyph="𝕏" />
                  <ShareButton aria="Copiar link" glyph="🔗" />
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
                    src={article.coverImageUrl}
                    alt={article.title}
                    className="aspect-[16/9] w-full rounded-lg object-cover"
                  />
                </figure>
              )}

              {/* Body */}
              {article.content ? (
                <div
                  className="prose prose-slate mt-8 max-w-none text-[16px] leading-relaxed text-slate-800 [&_p]:mt-4"
                  dangerouslySetInnerHTML={{ __html: article.content }}
                />
              ) : (
                <p className="mt-8 text-[16px] leading-relaxed text-slate-800">
                  {article.summary}
                </p>
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

              {/* Author bio */}
              <div className="mt-10">
                <AuthorBio
                  initials={authorInitials}
                  name={article.author.name ?? "Redação"}
                  role="O Patriota Notícias"
                  bio="Jornalista da equipa editorial do O Patriota."
                />
              </div>

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
                          className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md"
                        >
                          <p className="text-[11px] font-bold uppercase tracking-wider text-orange-600">
                            {r.category.name}
                          </p>
                          <h3 className="mt-1 text-[16px] font-bold leading-snug text-slate-900">
                            {r.title}
                          </h3>
                          {r.summary && (
                            <p className="mt-2 line-clamp-2 text-[13px] text-slate-600">
                              {r.summary}
                            </p>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </article>

            {/* Sidebar */}
            <div className="col-span-1 lg:col-span-4">
              <ArticleSidebar />
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

function ShareButton({ aria, glyph }: { aria: string; glyph: string }) {
  return (
    <button
      type="button"
      aria-label={aria}
      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-[14px] text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
    >
      {glyph}
    </button>
  );
}
