import Link from "next/link";
import { getReaderToken } from "@/lib/reader-api";
import { listComments, type PublicComment } from "@/lib/public-api";
import { CommentComposer } from "./CommentComposer";

const WHEN = new Intl.DateTimeFormat("pt-PT", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/**
 * The comment thread.
 *
 * Rendered on the SERVER, unlike the drawer-plus-iframe approach some
 * Portuguese titles use. Those sites embed Disqus, which cannot be
 * server-rendered at all — the drawer is damage control, not a design
 * choice. These comments live in our own Postgres, so rendering them into
 * the HTML makes them indexable (user-generated text is long-tail search
 * traffic and a freshness signal), costs no third-party JavaScript, and
 * adds nothing to the cookie banner.
 */
export async function ArticleComments({
  slug,
  totalHint,
}: {
  slug: string;
  totalHint: number;
}) {
  // Passing the reader token so the author sees their own still-pending
  // comment. Anonymous visitors simply get the approved ones.
  const token = await getReaderToken();
  const { items, total } = await listComments(slug, token);

  const roots = items.filter((c) => c.parentId === null);
  const repliesOf = (id: string) => items.filter((c) => c.parentId === id);

  return (
    <section id="comentarios" className="mt-12 scroll-mt-24">
      <div className="flex items-baseline justify-between border-b border-slate-200 pb-3">
        <h2 className="text-[20px] font-black text-slate-900">
          Comentários{" "}
          <span className="text-slate-400">({total || totalHint})</span>
        </h2>
      </div>

      {/* Composer, or a prompt to sign in. Only readers with a session may
          post — free or paying, never anonymous. */}
      <div className="mt-5">
        {token ? (
          <CommentComposer slug={slug} />
        ) : (
          <div className="rounded-[10px] border border-slate-200 bg-slate-50 px-5 py-4 text-center">
            <p className="text-[14px] text-slate-600">
              <Link
                href={`/conta/entrar?next=${encodeURIComponent(`/artigo/${slug}`)}`}
                className="font-semibold text-patriota-pure hover:underline"
              >
                Inicie sessão
              </Link>{" "}
              para participar nos comentários.
            </p>
            <p className="mt-1 text-[12px] text-slate-400">
              A conta é gratuita.{" "}
              <Link
                href="/conta/registar"
                className="underline hover:text-slate-600"
              >
                Criar conta
              </Link>
            </p>
          </div>
        )}
      </div>

      {roots.length === 0 ? (
        <p className="mt-8 text-center text-[14px] text-slate-400">
          Ainda não há comentários. Seja o primeiro a participar.
        </p>
      ) : (
        <ul className="mt-8 flex flex-col gap-5">
          {roots.map((c) => (
            <li key={c.id}>
              <CommentItem comment={c} />
              {repliesOf(c.id).length > 0 && (
                <ul className="mt-4 flex flex-col gap-4 border-l-2 border-slate-100 pl-5">
                  {repliesOf(c.id).map((r) => (
                    <li key={r.id}>
                      <CommentItem comment={r} />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function CommentItem({ comment }: { comment: PublicComment }) {
  const pending = comment.status === "PENDENTE";
  const initials = (comment.author.name || "L").slice(0, 2).toUpperCase();

  return (
    <article className="flex gap-3">
      <span
        aria-hidden
        className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[12px] font-bold text-slate-600"
      >
        {initials}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[13px] font-bold text-slate-900">
            {comment.author.name}
          </span>
          {comment.author.isMe && (
            <span className="rounded-full bg-patriota-pure/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-patriota-pure">
              Você
            </span>
          )}
          <span className="text-[12px] text-slate-400">
            {WHEN.format(new Date(comment.createdAt))}
          </span>
          {comment.editedAt && (
            <span className="text-[12px] text-slate-400">· editado</span>
          )}
          {pending && (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
              Aguarda moderação
            </span>
          )}
        </div>

        {/*
          Plain text, rendered as a child — NEVER dangerouslySetInnerHTML.
          The article body above uses it for Tiptap output; doing the same
          here would be stored XSS on every article page. The backend also
          strips tags on write, so both layers have to fail.
        */}
        <p className="mt-1.5 whitespace-pre-line text-[14px] leading-relaxed text-slate-700">
          {comment.body ?? <em className="text-slate-400">Comentário removido.</em>}
        </p>
      </div>
    </article>
  );
}
