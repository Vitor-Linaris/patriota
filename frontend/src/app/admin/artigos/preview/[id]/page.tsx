import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminShell } from "../../../AdminShell";
import { Container } from "@/components/Container";
import { EssentialBox } from "@/components/article/EssentialBox";
import { ContextBox } from "@/components/article/ContextBox";
import { Blockquote } from "@/components/article/Blockquote";
import { AuthorBio } from "@/components/article/AuthorBio";
import { apiFetch } from "@/lib/api";
import { imageVariant } from "@/lib/images";
import { adminMediaUrl } from "@/lib/media-preview";

/**
 * Admin-only preview of a single article, regardless of status.
 *
 * Why a dedicated page instead of redirecting to /artigo/<slug>:
 *   • The public route 404s on anything other than PUBLICADO, so a
 *     reviewer can't see a draft or in-review article.
 *   • A status banner up top reminds the reviewer they're looking
 *     at a non-public version (avoid the "why isn't this on the
 *     site?" confusion).
 *
 * Auth is enforced by apiFetch — the bearer token in the session
 * cookie has to map to a user with `artigos.ler`, which the
 * /admin/articles/:id endpoint requires.
 */

interface ArticlePreview {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  status: "RASCUNHO" | "EM_REVISAO" | "AGENDADO" | "PUBLICADO" | "ARQUIVADO";
  exclusive: boolean;
  views: number;
  readMinutes: number;
  essentials: string[];
  context: { columns: { label: string; body: string }[] } | null;
  pullQuote: { quote: string; cite: string } | null;
  coverImageUrl: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  category: { slug: string; name: string; color: string } | null;
  author: { id: string; name: string | null; email: string } | null;
}

const STATUS_BADGE: Record<ArticlePreview["status"], string> = {
  RASCUNHO: "bg-gray-100 text-gray-700 border-gray-300",
  EM_REVISAO: "bg-purple-100 text-purple-800 border-purple-300",
  AGENDADO: "bg-blue-100 text-blue-800 border-blue-300",
  PUBLICADO: "bg-green-100 text-green-800 border-green-300",
  ARQUIVADO: "bg-amber-100 text-amber-800 border-amber-300",
};

const STATUS_LABEL: Record<ArticlePreview["status"], string> = {
  RASCUNHO: "Rascunho",
  EM_REVISAO: "Em revisão",
  AGENDADO: "Agendado",
  PUBLICADO: "Publicado",
  ARQUIVADO: "Arquivado",
};

const dateFmt = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return dateFmt.format(new Date(iso));
  } catch {
    return "—";
  }
}

function initialsOf(name: string | null): string {
  if (!name) return "??";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function ArticlePreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const res = await apiFetch(`/admin/articles/${id}`);
  // 403 gets its own message — "not found" would tell someone without
  // artigos.ler that no such article exists, which is both untrue and
  // unhelpful. Anything else (404, deleted id) falls through to notFound().
  if (res.status === 403) {
    return (
      <AdminShell active="/admin/artigos">
        <Container className="py-16 text-center">
          <p className="text-sm font-semibold text-red-600">
            Sem permissão para ver este artigo.
          </p>
          <p className="mt-2 text-sm text-gray-500">
            Fala com um administrador se precisares de acesso.
          </p>
        </Container>
      </AdminShell>
    );
  }
  if (!res.ok) notFound();
  const article = (await res.json()) as ArticlePreview;
  const authorInitials = initialsOf(article.author?.name ?? null);

  return (
    <AdminShell active="/admin/artigos">
      <main className="bg-white">
        {/* Reviewer banner — pinned to the top of the preview so the
            editor knows they're seeing a non-public version. */}
        <div className="border-b border-amber-200 bg-amber-50">
          <Container className="flex flex-wrap items-center justify-between gap-3 py-3 text-[12px]">
            <div className="flex items-center gap-3 text-amber-900">
              <span className="font-bold uppercase tracking-wider">
                Pré-visualização
              </span>
              <span aria-hidden className="text-amber-300">
                ·
              </span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_BADGE[article.status]}`}
              >
                {STATUS_LABEL[article.status]}
              </span>
              {article.scheduledAt && (
                <span className="text-amber-700">
                  Agendado para {formatDate(article.scheduledAt)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/admin/artigos"
                className="rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100"
              >
                ← Voltar à lista
              </Link>
              {article.status === "PUBLICADO" && (
                <Link
                  href={`/artigo/${article.slug}`}
                  target="_blank"
                  rel="noopener"
                  className="rounded-lg bg-[#0F2C6B] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#1A3A7A]"
                >
                  Abrir versão pública →
                </Link>
              )}
            </div>
          </Container>
        </div>

        {/* Optional rejection note (for articles that were sent back) */}
        {article.rejectionReason && article.status === "RASCUNHO" && (
          <div className="border-b border-red-200 bg-red-50">
            <Container className="py-3 text-[12px] text-red-800">
              <span className="font-bold uppercase tracking-wider">
                Recusado:
              </span>{" "}
              {article.rejectionReason}
            </Container>
          </div>
        )}

        <Container className="py-10">
          <article className="mx-auto max-w-3xl">
            <nav
              aria-label="Breadcrumb"
              className="flex items-center gap-2 text-[13px] text-slate-500"
            >
              <Link href="/" className="hover:text-slate-900">
                Início
              </Link>
              <span aria-hidden>/</span>
              <span className="hover:text-slate-900">
                {article.category?.name ?? "—"}
              </span>
            </nav>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <span
                className="inline-flex rounded-[4px] px-3 py-1 text-[12px] font-bold uppercase tracking-wide text-white"
                style={{
                  backgroundColor: article.category?.color ?? "#1f2937",
                }}
              >
                {article.category?.name ?? "—"}
              </span>
              {article.exclusive && (
                <span className="rounded-full bg-[#FFCC66]/20 px-2 py-0.5 text-[10px] font-black text-[#8B6900]">
                  EXCLUSIVO
                </span>
              )}
            </div>

            <h1 className="mt-4 text-[32px] font-black leading-[1.15] text-slate-900 md:text-[42px] md:leading-[1.1]">
              {article.title}
            </h1>

            {article.summary && (
              <p className="mt-6 border-l-4 border-patriota-accent pl-5 text-[18px] leading-relaxed text-slate-700">
                {article.summary}
              </p>
            )}

            <div className="mt-8 flex flex-wrap items-center gap-4 border-y border-slate-200 py-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-patriota-pure text-[13px] font-bold text-patriota-accent">
                {authorInitials}
              </span>
              <div className="flex-1">
                <p className="text-[14px] font-bold text-slate-900">
                  {article.author?.name ?? "Redação"}
                </p>
                <p className="text-[12px] text-slate-500">
                  O Patriota Notícias
                </p>
              </div>
              <div className="text-right text-[12px] leading-relaxed text-slate-500">
                <p>
                  {article.status === "PUBLICADO" && article.publishedAt
                    ? formatDate(article.publishedAt)
                    : `Criado em ${formatDate(article.createdAt)}`}
                </p>
                <p>{article.readMinutes} min leitura</p>
              </div>
            </div>

            {article.essentials && article.essentials.length > 0 && (
              <div className="mt-8">
                <EssentialBox items={article.essentials} />
              </div>
            )}

            {article.coverImageUrl && (
              <figure className="mt-8">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={
                    // Through the admin proxy: this page exists to show
                    // an article BEFORE it is published, which is
                    // precisely when its media is still private.
                    adminMediaUrl(
                      imageVariant(article.coverImageUrl, "large") ??
                        article.coverImageUrl,
                    ) ?? ""
                  }
                  alt={article.title}
                  className="aspect-[16/9] w-full rounded-lg object-cover"
                />
              </figure>
            )}

            {article.content ? (
              <div
                className="prose prose-slate mt-8 max-w-none text-[16px] leading-relaxed text-slate-800 [&_p]:mt-4"
                dangerouslySetInnerHTML={{ __html: article.content }}
              />
            ) : (
              <p className="mt-8 text-[16px] italic leading-relaxed text-slate-400">
                Sem conteúdo no corpo do artigo.
              </p>
            )}

            {article.context?.columns &&
              article.context.columns.length > 0 && (
                <div className="mt-8">
                  <ContextBox columns={article.context.columns} />
                </div>
              )}

            {article.pullQuote?.quote && (
              <div className="mt-8">
                <Blockquote
                  quote={article.pullQuote.quote}
                  cite={article.pullQuote.cite}
                />
              </div>
            )}

            <div className="mt-10">
              <AuthorBio
                initials={authorInitials}
                name={article.author?.name ?? "Redação"}
                role="O Patriota Notícias"
                bio="Jornalista da equipa editorial do O Patriota."
              />
            </div>
          </article>
        </Container>
      </main>
    </AdminShell>
  );
}
