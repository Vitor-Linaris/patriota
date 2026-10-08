import Link from "next/link";
import { SectionHeading } from "./SectionHeading";
import { SeeMoreLink } from "../SeeMoreLink";
import { CategoryBadge } from "../CategoryBadge";
import { timeAgo, type ArticleSummary } from "@/lib/public-api";
import { ArticleCardImage } from "../ArticleCardImage";

interface Props {
  items: ArticleSummary[];
  /** There is more than these — show "Ver mais" to /ultimas-noticias. */
  hasMore?: boolean;
}

export function LatestNews({ items, hasMore = false }: Props) {
  return (
    <section>
      <SectionHeading>Últimas Notícias</SectionHeading>
      <ul className="mt-5 flex flex-col gap-4">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              href={`/artigo/${item.slug}`}
              // Phones: photo on top, text below. sm: and up: photo as a
              // column down the left side (see ArticleCardImage).
              className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white transition-all duration-300 hover:-translate-y-0.5 hover:border-patriota-medium hover:shadow-[0_6px_20px_-8px_rgba(15,44,107,0.18)] sm:flex-row"
            >
              <ArticleCardImage
                url={item.coverImageUrl}
                side="sm:w-56 sm:min-h-[168px] lg:w-72"
              />
              <div className="flex min-w-0 flex-1 flex-col justify-center p-4 sm:p-5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                  <CategoryBadge
                    name={item.category.name}
                    color={item.category.color}
                  />
                  <span aria-hidden>·</span>
                  <span>{timeAgo(item.publishedAt)}</span>
                  <span aria-hidden>·</span>
                  <span>{item.readMinutes} min leitura</span>
                </div>
                <h3 className="mt-2 line-clamp-3 wrap-anywhere text-[17px] font-bold leading-snug text-slate-900 transition-colors duration-200 group-hover:text-patriota-medium sm:line-clamp-2 lg:text-[18px]">
                  {item.title}
                </h3>
                {item.summary && (
                  <p className="mt-1.5 line-clamp-2 wrap-anywhere text-[13px] leading-relaxed text-slate-600 lg:line-clamp-3">
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
      {hasMore && <SeeMoreLink href="/ultimas-noticias" />}
    </section>
  );
}
