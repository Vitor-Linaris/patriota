import Link from "next/link";
import { notFound } from "next/navigation";
import { Container } from "@/components/Container";
import { TopBar } from "@/components/home/TopBar";
import { SiteHeader } from "@/components/home/SiteHeader";
import { SecondaryNav } from "@/components/home/SecondaryNav";
import { SiteFooter } from "@/components/home/SiteFooter";
import { FEATURES } from "@/lib/features";
import { requireReader } from "@/lib/reader-api";

export const metadata = {
  title: "A minha conta — O Patriota Notícias",
  robots: { index: false, follow: false },
};

// timeZone pinned — see TopBar.tsx's formatToday() for why.
const DATE = new Intl.DateTimeFormat("pt-PT", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Lisbon",
});

/** Sections of the reader area. All four are live as of M4/M5. */
const SECTIONS = [
  {
    href: "/conta/categorias",
    glyph: "◆",
    label: "Categorias que sigo",
    blurb:
      "Escolha os temas que lhe interessam e receba um e-mail quando sair notícia nova.",
    countKey: "categorias",
    empty: "Ainda não segue nenhuma categoria.",
    ready: true,
  },
  {
    href: "/conta/guardados",
    glyph: "♥",
    label: "Notícias guardadas",
    blurb: "As notícias que marcou para ler mais tarde.",
    countKey: "artigos",
    empty: "Ainda não guardou nenhuma notícia.",
    ready: true,
  },
  {
    href: "/conta/comentarios",
    glyph: "❝",
    label: "Os meus comentários",
    blurb: "Em que notícias participou nas últimas semanas.",
    countKey: "comentarios",
    empty: "Ainda não comentou nenhuma notícia.",
    ready: true,
  },
  {
    href: "/conta/historico",
    glyph: "◷",
    label: "Histórico de leitura",
    blurb: "O que andou a ler, por ordem cronológica.",
    countKey: "historico",
    empty: "Ainda não há histórico para mostrar.",
    ready: true,
  },
] as const;

export default async function ContaDashboardPage() {
  if (!FEATURES.readerArea) notFound();

  const me = await requireReader("/conta");
  const displayName = me.name?.trim() || me.email.split("@")[0];

  return (
    <div className="flex flex-1 flex-col bg-white text-slate-900">
      <TopBar />
      <SiteHeader />
      <SecondaryNav />

      <main className="bg-slate-50 py-10">
        <Container>
          <div className="mx-auto max-w-4xl">
            {/* ── Header ─────────────────────────────────────────── */}
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <span
                  aria-hidden
                  className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-patriota-pure text-[20px] font-black text-white"
                >
                  {displayName.slice(0, 2).toUpperCase()}
                </span>
                <div>
                  <h1 className="text-[26px] font-black leading-tight text-slate-900">
                    Olá, {displayName}
                  </h1>
                  <p className="text-[13px] text-slate-500">{me.email}</p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* `planActive`, not `plan`: the column keeps saying
                    PREMIUM past the end date until something tidies it,
                    and a badge that disagrees with the paywall is the
                    site arguing with the reader. Links to the page that
                    can actually explain it. */}
                <Link
                  href="/conta/assinatura"
                  className={`rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wide transition ${
                    me.planActive
                      ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
                      : "bg-slate-200 text-slate-600 hover:bg-slate-300"
                  }`}
                >
                  {me.planActive ? "Assinante" : "Conta gratuita"}
                </Link>
                {/* POST, not a link: a GET logout gets fired by prefetch. */}
                <form action="/conta/sair" method="post">
                  <button
                    type="submit"
                    className="rounded-[8px] border border-slate-300 bg-white px-3 py-1.5 text-[13px] text-slate-600 transition hover:border-slate-400 hover:text-slate-900"
                  >
                    Terminar sessão
                  </button>
                </form>
              </div>
            </div>

            {/* ── Unverified-email banner ─────────────────────────── */}
            {!me.emailVerifiedAt && (
              <div className="mt-6 rounded-[12px] border border-amber-300 bg-amber-50 px-5 py-4">
                <p className="text-[14px] font-bold text-amber-900">
                  Confirme o seu e-mail
                </p>
                <p className="mt-1 text-[13px] leading-relaxed text-amber-800">
                  Enviámos-lhe uma ligação de confirmação. Enquanto não
                  confirmar, não poderá comentar nem receber notificações.
                </p>
              </div>
            )}

            {/* ── Counters ────────────────────────────────────────── */}
            <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-4">
              {SECTIONS.map((s) => (
                <div
                  key={s.countKey}
                  className="rounded-[12px] border border-slate-200 bg-white px-4 py-4 text-center"
                >
                  <p className="text-[26px] font-black leading-none text-slate-900">
                    {me.counts[s.countKey]}
                  </p>
                  <p className="mt-1.5 text-[11px] uppercase tracking-wide text-slate-500">
                    {s.label.replace("Os meus ", "").replace("Histórico de ", "")}
                  </p>
                </div>
              ))}
            </div>

            {/* ── Sections ────────────────────────────────────────── */}
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {SECTIONS.map((s) => {
                const count = me.counts[s.countKey];
                const body = (
                  <>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className="text-[18px] text-patriota-pure"
                        >
                          {s.glyph}
                        </span>
                        <h2 className="text-[15px] font-bold text-slate-900">
                          {s.label}
                        </h2>
                      </div>
                      {!s.ready && (
                        <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                          Em breve
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-[13px] leading-relaxed text-slate-500">
                      {count > 0 ? s.blurb : s.empty}
                    </p>
                  </>
                );

                return s.ready ? (
                  <Link
                    key={s.href}
                    href={s.href}
                    className="rounded-[12px] border border-slate-200 bg-white p-5 transition hover:border-patriota-pure/40 hover:shadow-sm"
                  >
                    {body}
                  </Link>
                ) : (
                  <div
                    key={s.href}
                    className="rounded-[12px] border border-slate-200 bg-white p-5 opacity-75"
                  >
                    {body}
                  </div>
                );
              })}
            </div>

            {/* ── Account details ─────────────────────────────────── */}
            <div className="mt-4 rounded-[12px] border border-slate-200 bg-white p-5">
              <h2 className="text-[15px] font-bold text-slate-900">
                Dados da conta
              </h2>
              <dl className="mt-3 grid gap-x-8 gap-y-2.5 text-[13px] sm:grid-cols-2">
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <dt className="text-slate-500">E-mail</dt>
                  <dd className="font-medium text-slate-900">{me.email}</dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <dt className="text-slate-500">Estado</dt>
                  <dd className="font-medium text-slate-900">
                    {me.emailVerifiedAt ? "Confirmado" : "Por confirmar"}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <dt className="text-slate-500">Membro desde</dt>
                  <dd className="font-medium text-slate-900">
                    {DATE.format(new Date(me.createdAt))}
                  </dd>
                </div>
                <div className="flex justify-between border-b border-slate-100 pb-2">
                  <dt className="text-slate-500">Notificações</dt>
                  <dd className="font-medium text-slate-900">
                    {me.notifyNewArticles
                      ? me.digestFrequency === "DIARIO"
                        ? "Resumo diário"
                        : me.digestFrequency === "SEMANAL"
                          ? "Resumo semanal"
                          : me.digestFrequency === "IMEDIATO"
                            ? "Imediatas"
                            : "Desligadas"
                      : "Desligadas"}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        </Container>
      </main>

      <SiteFooter />
    </div>
  );
}
