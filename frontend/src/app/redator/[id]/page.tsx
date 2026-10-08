import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { BreakingNews } from "@/components/home/BreakingNews";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { SiteFooter } from "@/components/home/SiteFooter";
import { imageVariant } from "@/lib/images";
import { siteUrl } from "@/lib/site-url";
import { getAuthorProfile, listBreaking, timeAgo } from "@/lib/public-api";
import { roleLabel } from "@/lib/role-label";

/**
 * The two gaps the client asked to have covered explicitly: a staff
 * account is created with name and bio BLANK, and only becomes
 * mandatory the first time that person saves their own profile — see
 * UsersService.updateOwn. Nothing stops that person publishing an
 * article before ever touching their profile, so a byline can point at
 * a genuinely empty name or bio. A blank line where the bio should be
 * would look broken; this says plainly what is going on instead.
 */
const NO_NAME = "Nome ainda não definido";
const NO_BIO = "Esta pessoa ainda não escreveu uma biografia.";

function initialsOf(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const profile = await getAuthorProfile(id);
  if (!profile) return { title: "Autor não encontrado — O Patriota Notícias" };

  const name = profile.name ?? NO_NAME;
  const description = profile.bio ?? NO_BIO;
  const url = `${siteUrl()}/redator/${profile.id}`;

  return {
    title: `${name} — O Patriota Notícias`,
    description,
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      title: name,
      description,
      url,
      siteName: "O Patriota Notícias",
      locale: "pt_PT",
      images: profile.avatarUrl ? [profile.avatarUrl] : undefined,
    },
  };
}

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [profile, breaking] = await Promise.all([
    getAuthorProfile(id),
    listBreaking(4),
  ]);
  if (!profile) notFound();

  const name = profile.name ?? NO_NAME;
  const role = roleLabel(profile.role);

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
          <div className="mx-auto max-w-3xl">
            {/* Breadcrumb, same pattern as the article and static pages. */}
            <nav
              aria-label="Breadcrumb"
              className="mb-4 flex items-center gap-2 text-[12px] uppercase tracking-wider text-slate-400"
            >
              <Link href="/" className="transition-colors hover:text-patriota-medium">
                Início
              </Link>
              <span aria-hidden>/</span>
              <span>Redacção</span>
            </nav>

            {/* Profile card */}
            <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                {profile.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imageVariant(profile.avatarUrl, "small") ?? profile.avatarUrl}
                    alt=""
                    className="h-20 w-20 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-patriota-pure text-[26px] font-bold text-patriota-accent">
                    {initialsOf(profile.name)}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <h1 className="text-[28px] font-black leading-tight text-slate-900">
                    {name}
                  </h1>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-500">
                    <span className="font-semibold text-patriota-medium">
                      {role}
                    </span>
                    {profile.publishingCadence && (
                      <>
                        <span aria-hidden>·</span>
                        <span>Publica {profile.publishingCadence.toLowerCase()}</span>
                      </>
                    )}
                    <span aria-hidden>·</span>
                    <span>
                      {profile.articleCount}{" "}
                      {profile.articleCount === 1 ? "artigo publicado" : "artigos publicados"}
                    </span>
                  </div>

                  <p className="mt-4 text-[15px] leading-relaxed text-slate-700">
                    {profile.bio ?? NO_BIO}
                  </p>
                </div>
              </div>
            </section>

            {/* The last 10, same card shape as "Continuar a ler" on the
                article page — the visual language is already the site's,
                not reinvented here. */}
            {profile.articles.length > 0 && (
              <section className="mt-10">
                <h2 className="text-[20px] font-black uppercase tracking-wide text-slate-900">
                  Últimos artigos
                </h2>
                <ul className="mt-5 grid grid-cols-1 gap-5 sm:grid-cols-2">
                  {profile.articles.map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/artigo/${a.slug}`}
                        className="group block overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:border-patriota-medium hover:shadow-[0_6px_20px_-8px_rgba(15,44,107,0.18)]"
                      >
                        {a.coverImageUrl && (
                          <div className="aspect-[16/9] w-full overflow-hidden">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={imageVariant(a.coverImageUrl, "small") ?? a.coverImageUrl}
                              alt=""
                              className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                            />
                          </div>
                        )}
                        <div className="p-4">
                          <p className="text-[11px] font-bold uppercase tracking-wider text-orange-600">
                            {a.category.name}
                          </p>
                          <h3 className="mt-1 line-clamp-2 wrap-anywhere text-[16px] font-bold leading-snug text-slate-900 transition-colors duration-200 group-hover:text-patriota-medium">
                            {a.title}
                          </h3>
                          <p className="mt-2 text-[12px] text-slate-500">
                            {timeAgo(a.publishedAt)}
                          </p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
