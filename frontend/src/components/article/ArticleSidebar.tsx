import { FEATURES } from "@/lib/features";
import { NewsletterForm } from "@/components/home/NewsletterForm";
import { AdSlot } from "@/components/ads/AdSlot";
import type { Ad } from "@/lib/ads";

export function ArticleSidebar({
  ad,
  adBelowNewsletter,
}: {
  ad?: Ad | null;
  adBelowNewsletter?: Ad | null;
} = {}) {
  return (
    <aside className="flex flex-col gap-6">
      {/* Sidebar ad slot (article-sidebar, 300×250 IAB MPU). */}
      <AdSlot ad={ad} variant="none" />

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

      {/* Sidebar ad slot (article-sidebar-bottom, 300×600 Half Page —
          tall, not wide: this column is ~300px, so a vertical format
          reads correctly at that width instead of collapsing to a
          sliver). */}
      <AdSlot ad={adBelowNewsletter} variant="none" />
    </aside>
  );
}
