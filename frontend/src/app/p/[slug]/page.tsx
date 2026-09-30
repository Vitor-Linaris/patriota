import { notFound } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { BreakingNews } from "@/components/home/BreakingNews";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { SiteFooter } from "@/components/home/SiteFooter";
import { listBreaking } from "@/lib/public-api";
import { FEATURES } from "@/lib/features";
import {
  STATIC_PAGES,
  STATIC_PAGE_SLUGS,
  sectionAnchor,
  sectionLabel,
  sectionPlainText,
  type Block,
} from "@/lib/static-pages";
import { SubscribeButton } from "@/components/article/SubscribeButton";
import { LegalSearch } from "@/components/legal/LegalSearch";

export function generateStaticParams() {
  return STATIC_PAGE_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const page = STATIC_PAGES[slug];
  if (!page) return { title: "Página não encontrada" };
  return {
    title: `${page.title} — O Patriota Notícias`,
    description: page.intro.slice(0, 160),
  };
}

function renderBlock(block: Block, i: number) {
  if (block.type === "p") {
    return (
      <p key={i} className="text-[15px] leading-relaxed text-slate-700">
        {block.text}
      </p>
    );
  }
  return (
    <ul
      key={i}
      className="ml-5 list-disc space-y-1.5 text-[15px] leading-relaxed text-slate-700"
    >
      {block.items.map((item, j) => (
        <li key={j}>{item}</li>
      ))}
    </ul>
  );
}

export default async function StaticPageRoute({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const page = STATIC_PAGES[slug];
  if (!page) notFound();
  const breaking = await listBreaking(4);

  // Every page under Legal (Termos, Privacidade, Cookies, ERC) gets the
  // search box — these are the long, numbered documents someone lands
  // on looking for ONE clause, not the short institutional pages.
  const isLegal = page.crumb === "Legal";
  // The only inbox that actually exists — see the comment on
  // identificacaoBlocks() in static-pages.ts. Every page on the site
  // points here, not just the legal ones.
  const CONTACT_EMAIL = "geral@opatriota.pt";

  const articleBody = (
    <>
      <div className="space-y-10">
        {page.sections.map((section, i) => (
          <section key={i} id={sectionAnchor(section.heading)}>
            <h2 className="mb-4 scroll-mt-24 text-[20px] font-black text-patriota-dark">
              {section.heading}
            </h2>
            <div className="space-y-3">{section.blocks.map(renderBlock)}</div>
          </section>
        ))}
      </div>

      <hr className="my-10 border-slate-100" />
      <p className="text-[13px] text-slate-500">
        Tem dúvidas sobre esta página?{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="font-semibold text-patriota-medium hover:underline"
        >
          {CONTACT_EMAIL}
        </a>
      </p>
    </>
  );

  const searchItems = isLegal
    ? page.sections.map((section) => ({
        label: sectionLabel(section.heading),
        anchor: sectionAnchor(section.heading),
        text: sectionPlainText(section),
      }))
    : [];

  return (
    <div className="flex flex-1 flex-col bg-white text-slate-900">
      <TopBar />
      <BreakingNews
        items={breaking.map((a) => ({ slug: a.slug, title: a.title }))}
      />
      <SiteHeader />
      <SecondaryNav />

      <main className="bg-slate-50 py-12">
        <Container>
          <article
            className={
              "rounded-2xl border border-slate-200 bg-white p-8 shadow-sm md:p-12 " +
              (page.sidebarToc ? "mx-auto max-w-5xl" : "mx-auto max-w-3xl")
            }
          >
            {/* Breadcrumb */}
            <nav
              aria-label="Breadcrumb"
              className="mb-3 flex items-center gap-2 text-[12px] uppercase tracking-wider text-slate-400"
            >
              <Link
                href="/"
                className="transition-colors hover:text-patriota-medium"
              >
                Início
              </Link>
              {page.crumb && (
                <>
                  <span aria-hidden>/</span>
                  <span>{page.crumb}</span>
                </>
              )}
            </nav>

            <h1 className="text-[32px] font-black leading-tight text-slate-900 md:text-[40px]">
              {page.title}
            </h1>
            <p className="mt-2 text-[12px] uppercase tracking-wider text-slate-400">
              Última actualização: {page.updatedAt}
            </p>

            <p className="mt-6 text-[16px] leading-relaxed text-slate-600">
              {page.intro}
            </p>

            {/*
              Slug-scoped call to action. Lives here rather than in
              static-pages.ts on purpose: that map is deliberately plain
              text (paragraphs and lists) so it can be edited without
              touching JSX, and links are the one thing it cannot carry.
            */}
            {slug === "assinatura" && FEATURES.readerArea && (
              <div className="mt-8 flex flex-wrap items-center gap-3 rounded-[12px] border border-slate-200 bg-slate-50 px-5 py-4">
                {/* Once payments are live, subscribing is the action
                    this page exists for and goes first. Until then the
                    free account is the only thing on offer, and leading
                    with a button that cannot work would be a lie. */}
                {FEATURES.billing ? (
                  <>
                    <SubscribeButton
                      returnTo="/p/assinatura"
                      className="rounded-[8px] bg-patriota-pure px-4 py-2.5 text-[14px] font-bold text-white transition hover:brightness-110 disabled:opacity-60"
                    >
                      Assinar
                    </SubscribeButton>
                    {/* One label for both states, and no cookie read:
                        /conta sends an anonymous visitor to sign in on
                        its own, and reading the cookie here would opt
                        every static page out of static generation. */}
                    <Link
                      href="/conta/assinatura"
                      className="text-[14px] font-semibold text-patriota-medium hover:underline"
                    >
                      A minha assinatura
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href="/conta/registar"
                      className="rounded-[8px] bg-patriota-pure px-4 py-2.5 text-[14px] font-bold text-white transition hover:brightness-110"
                    >
                      Criar conta gratuita
                    </Link>
                    <Link
                      href="/conta/entrar"
                      className="text-[14px] font-semibold text-patriota-medium hover:underline"
                    >
                      Já tenho conta
                    </Link>
                  </>
                )}
              </div>
            )}

            {isLegal && (
              <div className="mt-8">
                <LegalSearch items={searchItems} />
              </div>
            )}

            {page.sidebarToc ? (
              <div className="mt-2 grid grid-cols-1 gap-10 lg:grid-cols-[220px_1fr]">
                <nav
                  aria-label="Sumário"
                  className="lg:sticky lg:top-24 lg:self-start"
                >
                  <p className="text-[12px] font-bold uppercase tracking-wider text-slate-400">
                    Sumário
                  </p>
                  <ul className="mt-3 space-y-2 border-l border-slate-200 text-[13px]">
                    {page.sections.map((section) => (
                      <li key={section.heading}>
                        <a
                          href={`#${sectionAnchor(section.heading)}`}
                          className="block border-l-2 border-transparent py-0.5 pl-3 -ml-px text-slate-600 transition-colors hover:border-patriota-medium hover:text-patriota-medium"
                        >
                          {sectionLabel(section.heading)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </nav>
                <div className="min-w-0">{articleBody}</div>
              </div>
            ) : (
              <div className="mt-10">{articleBody}</div>
            )}
          </article>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
