import Link from "next/link";
import { notFound } from "next/navigation";
import { FEATURES } from "@/lib/features";
import { readerApiFetch, requireReader } from "@/lib/reader-api";
import { ContaShell, EmptyState } from "../ContaShell";

export const metadata = {
  title: "Os meus comentários — O Patriota Notícias",
  robots: { index: false, follow: false },
};

interface MyComment {
  id: string;
  body: string;
  status: "PENDENTE" | "APROVADO" | "REJEITADO" | "SPAM" | "ELIMINADO";
  createdAt: string;
  editedAt: string | null;
  article: {
    slug: string;
    title: string;
    category: { slug: string; name: string; color: string };
  };
}

/** The requirement was "which articles did I comment on in recent weeks". */
const WINDOWS = [
  { days: "30", label: "30 dias" },
  { days: "90", label: "3 meses" },
  { days: "365", label: "1 ano" },
  { days: "", label: "Sempre" },
] as const;

// timeZone pinned — see TopBar.tsx's formatToday() for why.
const WHEN = new Intl.DateTimeFormat("pt-PT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Lisbon",
});

const BADGE: Record<string, { label: string; cls: string }> = {
  PENDENTE: { label: "Aguarda moderação", cls: "bg-amber-100 text-amber-700" },
  APROVADO: { label: "Publicado", cls: "bg-emerald-100 text-emerald-700" },
  REJEITADO: { label: "Não publicado", cls: "bg-slate-200 text-slate-600" },
  SPAM: { label: "Marcado como spam", cls: "bg-slate-200 text-slate-600" },
};

export default async function MeusComentariosPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string }>;
}) {
  if (!FEATURES.readerArea) notFound();
  await requireReader("/conta/comentarios");

  const { desde } = await searchParams;
  const active = WINDOWS.some((w) => w.days === desde) ? desde! : "90";

  const qs = new URLSearchParams({ pageSize: "50" });
  if (active) qs.set("since", active);

  const res = await readerApiFetch(`/reader/comments?${qs.toString()}`);
  const data =
    res && res.ok
      ? ((await res.json()) as { items: MyComment[]; total: number })
      : { items: [], total: 0 };

  return (
    <ContaShell
      active="/conta/comentarios"
      title="Os meus comentários"
      subtitle="Em que notícias participou."
      action={
        <nav className="flex flex-wrap gap-1.5">
          {WINDOWS.map((w) => (
            <Link
              key={w.label}
              href={`/conta/comentarios?desde=${w.days}`}
              className={`rounded-full px-3 py-1 text-[12px] font-medium transition ${
                active === w.days
                  ? "bg-patriota-pure text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-slate-400"
              }`}
            >
              {w.label}
            </Link>
          ))}
        </nav>
      }
    >
      {data.items.length === 0 ? (
        <EmptyState
          glyph="❝"
          title="Sem comentários neste período"
          body="Participe nas notícias que lhe interessam — os seus comentários aparecem aqui."
          cta={
            <Link
              href="/"
              className="inline-block rounded-[8px] bg-patriota-pure px-4 py-2 text-[13px] font-bold text-white transition hover:brightness-110"
            >
              Ver as últimas notícias
            </Link>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {data.items.map((c) => {
            const badge = BADGE[c.status];
            return (
              <li
                key={c.id}
                className="rounded-[12px] border border-slate-200 bg-white p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className="text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: c.article.category.color }}
                  >
                    {c.article.category.name}
                  </span>
                  {badge && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${badge.cls}`}
                    >
                      {badge.label}
                    </span>
                  )}
                </div>

                <Link
                  href={`/artigo/${c.article.slug}#comentarios`}
                  className="mt-1 block text-[15px] font-bold leading-snug text-slate-900 transition hover:text-patriota-pure"
                >
                  {c.article.title}
                </Link>

                {/* Plain text — never dangerouslySetInnerHTML. */}
                <p className="mt-2 whitespace-pre-line border-l-2 border-slate-200 pl-3 text-[14px] leading-relaxed text-slate-600">
                  {c.body}
                </p>

                <p className="mt-2 text-[12px] text-slate-400">
                  {WHEN.format(new Date(c.createdAt))}
                  {c.editedAt && " · editado"}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </ContaShell>
  );
}
