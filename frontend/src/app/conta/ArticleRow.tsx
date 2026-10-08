import Link from "next/link";
import { ArticleCardImage } from "@/components/ArticleCardImage";

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

// timeZone pinned — see TopBar.tsx's formatToday() for why.
const WHEN = new Intl.DateTimeFormat("pt-PT", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Europe/Lisbon",
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
      // Phones: photo on top, text below (see ArticleCardImage).
      className="group flex flex-col overflow-hidden rounded-[12px] border border-slate-200 bg-white transition hover:border-patriota-pure/40 hover:shadow-sm sm:flex-row sm:gap-4 sm:p-4"
    >
      {/* No placeholder here when there is no photo — this list never
          had one, and the text simply starts at the left. */}
      {article.coverImageUrl && (
        <ArticleCardImage
          url={article.coverImageUrl}
          thumb="sm:h-[76px] sm:w-[120px]"
        />
      )}

      <div className="min-w-0 flex-1 p-4 sm:p-0">
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
