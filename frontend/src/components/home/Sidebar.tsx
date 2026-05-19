import { SectionHeading } from "./SectionHeading";
import { listMostRead, listPublicArticles } from "@/lib/public-api";
import { NewsletterForm } from "./NewsletterForm";
import { FEATURES } from "@/lib/features";

function initialsOf(name: string | null): string {
  if (!name) return "—";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

export async function Sidebar() {
  const [mostRead, opinion] = await Promise.all([
    listMostRead(4),
    listPublicArticles({ category: "opiniao", pageSize: 3 }),
  ]);

  return (
    <aside className="flex flex-col gap-8">
      {/* Most read */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <nav
          aria-label="Mais lidas"
          className="flex border-b border-slate-200 text-[12px]"
        >
          <button className="flex-1 border-b-2 border-orange-500 bg-orange-50 px-4 py-4 font-bold text-slate-900">
            Mais Lidas
          </button>
          {FEATURES.comments && (
            <button className="flex-1 px-4 py-4 font-semibold text-slate-500 hover:text-slate-700">
              Mais Comentadas
            </button>
          )}
          {FEATURES.comments && (
            <button className="flex-1 px-4 py-4 text-center font-semibold leading-tight text-slate-500 hover:text-slate-700">
              Escolha da
              <br />
              Redação
            </button>
          )}
        </nav>
        {mostRead.length === 0 ? (
          <p className="px-4 py-6 text-center text-[12px] text-slate-400">
            Sem artigos para mostrar.
          </p>
        ) : (
          <ol className="divide-y divide-slate-100">
            {mostRead.map((m, i) => (
              <li
                key={m.id}
                className="flex gap-3 px-4 py-3 hover:bg-slate-50"
              >
                <span className="text-2xl font-black leading-none text-slate-300">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600">
                    {m.category.name}
                  </p>
                  <h4 className="mt-1 text-[13px] font-bold leading-snug text-slate-900">
                    <a
                      href={`/artigo/${m.slug}`}
                      className="hover:text-patriota-medium"
                    >
                      {m.title}
                    </a>
                  </h4>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* NOS Ad card */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-rose-50 to-amber-50 p-6 text-center shadow-sm">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-lg bg-white text-3xl font-black text-rose-500 shadow">
          N
        </div>
        <p className="text-[15px] font-bold text-slate-900">
          NOS — Internet Fibra 1 Gbps
        </p>
        <p className="mt-2 text-[13px] text-slate-600">
          Velocidade máxima para toda a família. A partir de 29,99€/mês.
        </p>
        <a
          href="#"
          className="mt-4 inline-flex rounded-md bg-rose-500 px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-rose-600"
        >
          Ver oferta
        </a>
        <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-400">
          Publicidade
        </p>
      </section>

      {/* Opinion */}
      {opinion.items.length > 0 && (
        <section>
          <SectionHeading>Opinião</SectionHeading>
          <ul className="mt-4 flex flex-col gap-3">
            {opinion.items.map((o) => (
              <li key={o.id}>
                <a
                  href={`/artigo/${o.slug}`}
                  className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-patriota-medium text-[12px] font-bold text-white">
                    {initialsOf(o.author.name)}
                  </span>
                  <div className="min-w-0">
                    <p className="text-[12px] font-semibold text-slate-900">
                      {o.author.name ?? "Editorial"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      {o.category.name}
                    </p>
                    <h4 className="mt-2 text-[13px] font-bold leading-snug text-slate-900">
                      {o.title}
                    </h4>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Newsletter */}
      <section className="rounded-xl bg-patriota-dark p-6 text-white shadow-md">
        <p className="text-[11px] font-bold uppercase tracking-wider text-patriota-accent">
          Newsletter
        </p>
        <h3 className="mt-2 text-[20px] font-black leading-snug">
          Receba as manchetes do dia
        </h3>
        <p className="mt-2 text-[13px] text-white/70">
          Curadoria editorial diária, sem spam. Cancelamento imediato.
        </p>
        <NewsletterForm />
      </section>
    </aside>
  );
}
