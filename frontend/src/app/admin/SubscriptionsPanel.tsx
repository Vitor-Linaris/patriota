import Link from "next/link";
import type { SubscriptionStats } from "./leitores/AdminReadersClient";

const intFmt = new Intl.NumberFormat("pt-PT");
const DAY_MONTH = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "short",
});

function daysUntil(iso: string): number {
  return Math.max(
    0,
    Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000),
  );
}

/**
 * How the paid product is doing, on the newsroom's landing page.
 *
 * Every figure here is counted by DATE rather than by `plan = PREMIUM`.
 * That matters more on a dashboard than anywhere else: these are the
 * numbers somebody puts in a report, and the plain count overstates by
 * however many subscriptions have ended without anybody signing in since.
 *
 * Rendered only for staff with `leitores.ver` — how many people pay for
 * the paper is not something a dashboard should show everyone who can
 * log in.
 */
export function SubscriptionsPanel({ s }: { s: SubscriptionStats }) {
  const total = s.active + s.free;
  const share = total > 0 ? Math.round((s.active / total) * 100) : 0;

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-gray-200 bg-white">
      <header className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
        <div>
          <h2 className="text-sm font-bold text-[#0F2C6B]">Assinaturas</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {share}% dos leitores registados são assinantes
          </p>
        </div>
        <Link
          href="/admin/leitores?plan=PREMIUM"
          className="text-xs font-semibold text-[#0F2C6B] hover:underline"
        >
          Ver leitores →
        </Link>
      </header>

      {/* Each figure opens the list filtered to exactly the rows it
          counted — same helper, same window constants, server side. The
          two campaign lists are the reason this panel links anywhere:
          "12 a expirar" is a fact, and the click is what turns it into
          twelve addresses to write to. */}
      <div className="grid grid-cols-2 gap-px bg-gray-100 md:grid-cols-4">
        <Figure
          label="Assinantes activos"
          value={s.active}
          hint={
            s.paid + s.gifted > 0
              ? `${intFmt.format(s.paid)} pagas · ${intFmt.format(s.gifted)} oferecidas`
              : "Ainda nenhuma"
          }
          accent="text-amber-700"
          href="/admin/leitores?active=true"
        />
        <Figure
          label="Leitores gratuitos"
          value={s.free}
          hint="Conta criada, sem assinatura"
          accent="text-[#0F2C6B]"
          href="/admin/leitores?plan=GRATIS"
        />
        <Figure
          label={`Novas em ${s.newWindowDays} dias`}
          value={s.newRecently}
          hint="Começadas neste período"
          accent="text-green-700"
          href="/admin/leitores?newPlans=true"
        />
        <Figure
          label={`A expirar em ${s.expiryHorizonDays} dias`}
          value={s.expiringSoon}
          hint="Só as oferecidas"
          accent={s.expiringSoon > 0 ? "text-red-700" : "text-gray-400"}
          href="/admin/leitores?expiring=true"
        />
      </div>

      {/* The list is what makes the number above worth showing: an admin
          can act on a name and a date, not on a count. */}
      {s.expiring.length > 0 && (
        <ul className="divide-y divide-gray-100 border-t border-gray-100">
          {s.expiring.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 px-5 py-3 transition-colors hover:bg-[#F7F8FA]"
            >
              {/* Straight to this one reader, by e-mail — the surest
                  handle, since two people can share a name. */}
              <Link
                href={`/admin/leitores?q=${encodeURIComponent(r.email)}`}
                className="min-w-0 flex-1"
              >
                <span className="text-sm font-semibold text-gray-800 hover:underline">
                  {r.name ?? r.email}
                </span>
                {r.planNote && (
                  <span className="ml-2 text-xs text-gray-500">
                    {r.planNote}
                  </span>
                )}
              </Link>
              {r.planRenewsAt && (
                <span
                  className={`text-xs font-semibold ${
                    daysUntil(r.planRenewsAt) <= 7
                      ? "text-red-600"
                      : "text-gray-500"
                  }`}
                >
                  {DAY_MONTH.format(new Date(r.planRenewsAt))} · faltam{" "}
                  {daysUntil(r.planRenewsAt)}d
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* Shown only when there is something to explain. The gap between
          "assinantes activos" and the raw PREMIUM count is rows whose
          date has passed and that nothing has tidied yet — without a
          word here, the two numbers look like a bug. */}
      {s.lapsed > 0 && (
        <p className="border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
          Mais {intFmt.format(s.lapsed)}{" "}
          {s.lapsed === 1 ? "conta marcada" : "contas marcadas"} como
          assinante com a data já passada. Não contam acima e voltam a
          gratuito sozinhas no próximo acesso de cada uma.
        </p>
      )}
    </section>
  );
}

function Figure({
  label,
  value,
  hint,
  accent,
  href,
}: {
  label: string;
  value: number;
  hint: string;
  accent: string;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="group block bg-white p-5 transition-colors hover:bg-[#F7F8FA]"
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </p>
      <p className={`text-3xl font-black ${accent}`}>{intFmt.format(value)}</p>
      <p className="mt-1 text-xs text-gray-500">
        {hint}
        {/* Only on hover: an arrow on every card at rest turns four
            figures into four calls to action and buries the numbers. */}
        <span className="ml-1 text-[#0F2C6B] opacity-0 transition-opacity group-hover:opacity-100">
          →
        </span>
      </p>
    </Link>
  );
}
