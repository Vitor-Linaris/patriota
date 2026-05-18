import Link from "next/link";
import { SectionHeading } from "./SectionHeading";
import { CATEGORY_COLOR } from "./HeroGrid";
import { timeAgo, type ArticleSummary } from "@/lib/public-api";

interface Props {
  items: ArticleSummary[];
}

export function LatestNews({ items }: Props) {
  return (
    <section>
      <SectionHeading>Últimas Notícias</SectionHeading>
      <ul className="mt-5 flex flex-col gap-4">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/artigo/${item.slug}`}
              className="flex gap-4 rounded-xl border border-slate-200 bg-white p-4 transition hover:shadow-md"
            >
              <div className="hidden h-20 w-28 shrink-0 rounded-md bg-gradient-to-br from-slate-200 to-slate-300 sm:block" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <span
                    className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white ${CATEGORY_COLOR[item.category.name] ?? "bg-slate-600"}`}
                  >
                    {item.category.name}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{timeAgo(item.publishedAt)}</span>
                  <span aria-hidden>·</span>
                  <span>{item.readMinutes} min leitura</span>
                </div>
                <h3 className="mt-2 text-[15px] font-bold leading-snug text-slate-900">
                  {item.title}
                </h3>
                {item.summary && (
                  <p className="mt-1 line-clamp-2 text-[13px] text-slate-600">
                    {item.summary}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
        {items.length === 0 && (
          <li className="text-sm text-slate-400">Sem artigos publicados.</li>
        )}
      </ul>
    </section>
  );
}
