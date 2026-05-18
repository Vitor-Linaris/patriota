import Link from "next/link";
import { SectionHeading } from "./SectionHeading";
import type { ArticleSummary } from "@/lib/public-api";

const ACCENTS = ["bg-red-600", "bg-amber-600"];

interface Props {
  items: ArticleSummary[];
}

export function InvestigationSection({ items }: Props) {
  if (items.length === 0) return null;
  return (
    <section>
      <SectionHeading>Investigação & Análise</SectionHeading>
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {items.slice(0, 2).map((c, i) => (
          <article
            key={c.id}
            className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-6 transition hover:shadow-md"
          >
            <span
              className={`inline-flex w-fit rounded px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white ${ACCENTS[i % ACCENTS.length]}`}
            >
              {c.category.name}
            </span>
            <h3 className="text-[18px] font-black leading-snug text-slate-900">
              <Link
                href={`/artigo/${c.slug}`}
                className="hover:text-patriota-medium"
              >
                {c.title}
              </Link>
            </h3>
            {c.summary && (
              <p className="text-[13px] leading-relaxed text-slate-600">
                {c.summary}
              </p>
            )}
            <Link
              href={`/artigo/${c.slug}`}
              className="mt-auto text-[12px] font-semibold uppercase tracking-wider text-patriota-medium"
            >
              {c.readMinutes} min leitura →
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}
