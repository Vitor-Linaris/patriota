import Link from "next/link";
import { imageVariant } from "@/lib/images";

export interface ReaderArticleCard {
  id: string;
  slug: string;
  title: string;
  summary: string;
  coverImageUrl: string | null;
  readMinutes: number;
  publishedAt: string | null;
  commentCount: number;
  category: { slug: string; name: string; color: string };
}

const WHEN = new Intl.DateTimeFormat("pt-PT", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

/** Shared list item for saved articles and reading history. */
export function ArticleRow({
  article,
  meta,
}: {
  article: ReaderArticleCard;
  meta?: string;
}) {
  return (
    <Link
      href={`/artigo/${article.slug}`}
      className="group flex gap-4 rounded-[12px] border border-slate-200 bg-white p-4 transition hover:border-patriota-pure/40 hover:shadow-sm"
    >
      {article.coverImageUrl ? (
        <div className="hidden h-[76px] w-[120px] shrink-0 overflow-hidden rounded-[8px] sm:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageVariant(article.coverImageUrl, "small") ?? article.coverImageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : null}

      <div className="min-w-0 flex-1">
        <p
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: article.category.color }}
        >
          {article.category.name}
        </p>
        <h2 className="mt-1 text-[16px] font-bold leading-snug text-slate-900 transition-colors group-hover:text-patriota-pure">
          {article.title}
        </h2>
        {article.summary && (
          <p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-slate-500">
            {article.summary}
          </p>
        )}
        <p className="mt-2 text-[12px] text-slate-400">
          {article.publishedAt ? WHEN.format(new Date(article.publishedAt)) : "—"}
          {" · "}
          {article.readMinutes} min
          {article.commentCount > 0 &&
            ` · ${article.commentCount} ${
              article.commentCount === 1 ? "comentário" : "comentários"
            }`}
          {meta && ` · ${meta}`}
        </p>
      </div>
    </Link>
  );
}
