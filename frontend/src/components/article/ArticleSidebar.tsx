import { FEATURES } from "@/lib/features";
import { NewsletterForm } from "@/components/home/NewsletterForm";

export function ArticleSidebar() {
  return (
    <aside className="flex flex-col gap-6">
      {/* Santander ad */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-gradient-to-br from-red-50 to-orange-50 p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-lg bg-white text-3xl font-black text-red-600 shadow">
          S
        </div>
        <p className="text-[15px] font-bold text-slate-900">
          Santander — Conta Jovem sem custos
        </p>
        <p className="mt-2 text-[13px] text-slate-600">
          Para jovens até 30 anos. Cartão gratuito, transferências ilimitadas.
        </p>
        <a
          href="#"
          className="mt-4 inline-flex rounded-md bg-red-600 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-red-700"
        >
          Abrir conta
        </a>
        <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-400">
          Publicidade
        </p>
      </section>

      {/* Acompanhar tema — feature-flagged (requires reader accounts) */}
      {FEATURES.topicFollow && (
        <section className="rounded-lg bg-patriota-dark p-6 text-white shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-patriota-accent">
            Acompanhar tema
          </p>
          <h2 className="mt-2 text-[18px] font-black leading-snug">
            Receba alertas
          </h2>
          <p className="mt-2 text-[13px] text-white/70">
            Avisamos quando este tema voltar a ser notícia.
          </p>
          <button
            type="button"
            className="mt-5 h-10 w-full rounded-md bg-patriota-accent text-[13px] font-bold text-patriota-ink transition hover:brightness-105"
          >
            Seguir tema
          </button>
        </section>
      )}

      {/* Ouvir artigo — feature-flagged (requires TTS provider) */}
      {FEATURES.audioReader && (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-4">
            <button
              type="button"
              aria-label="Reproduzir áudio do artigo"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-patriota-pure text-patriota-accent transition hover:opacity-90"
            >
              ▶
            </button>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-slate-900">
                Ouvir artigo
              </p>
              <p className="text-[12px] text-slate-500">Narrado por IA</p>
            </div>
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
            <span className="block h-full w-1/3 rounded-full bg-patriota-pure" />
          </div>
        </section>
      )}

      {/* Newsletter */}
      <section className="rounded-lg border border-slate-200 bg-patriota-dark p-6 text-white shadow-sm">
        <p className="text-[11px] font-bold uppercase tracking-wider text-patriota-accent">
          Newsletter
        </p>
        <h2 className="mt-2 text-[18px] font-black">
          Manchetes diárias por e-mail
        </h2>
        <p className="mt-2 text-[13px] text-white/70">
          Curadoria editorial, sem spam. Cancelamento imediato.
        </p>
        <NewsletterForm />
      </section>
    </aside>
  );
}
