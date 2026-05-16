interface FeaturedArticleProps {
  category: string;
  title: string;
  excerpt: string;
  author: { initials: string; name: string };
  publishedAt: string;
  time: string;
  readMinutes: number;
}

export function FeaturedArticle({
  category,
  title,
  excerpt,
  author,
  publishedAt,
  time,
  readMinutes,
}: FeaturedArticleProps) {
  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Image / gradient hero */}
      <div className="relative h-[224px] bg-gradient-to-br from-patriota-medium via-patriota-dark to-patriota-medium px-6 py-8 text-white">
        <div className="flex items-center gap-3 text-[12px] text-white/80">
          <span className="rounded bg-red-600 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
            {category}
          </span>
          <span>{time}</span>
          <span aria-hidden>·</span>
          <span>{readMinutes} min leitura</span>
        </div>
        <h3 className="mt-5 max-w-[700px] text-[22px] font-black leading-tight md:text-[26px]">
          {title}
        </h3>
      </div>
      {/* Footer with excerpt + author */}
      <div className="px-6 py-5">
        <p className="text-[15px] text-slate-700">{excerpt}</p>
        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-patriota-medium text-[11px] font-bold text-white">
              {author.initials}
            </span>
            <div className="text-[12px] leading-tight">
              <p className="font-semibold text-slate-800">{author.name}</p>
              <p className="text-slate-500">{publishedAt}</p>
            </div>
          </div>
          <a
            href="#"
            className="text-[13px] font-semibold text-patriota-medium hover:text-patriota-dark"
          >
            Ler artigo →
          </a>
        </div>
      </div>
    </article>
  );
}
