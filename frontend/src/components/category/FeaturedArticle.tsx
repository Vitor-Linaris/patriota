import { imageVariant } from "@/lib/images";

interface FeaturedArticleProps {
  category: string;
  title: string;
  excerpt: string;
  author: { initials: string; name: string };
  publishedAt: string;
  time: string;
  readMinutes: number;
  coverImageUrl?: string | null;
  slug?: string;
}

export function FeaturedArticle({
  category,
  title,
  excerpt,
  author,
  publishedAt,
  time,
  readMinutes,
  coverImageUrl,
  slug,
}: FeaturedArticleProps) {
  return (
    <article className="overflow-hidden rounded-[12px] border border-[#f3f4f6] bg-white shadow-[0px_1px_3px_0px_rgba(0,0,0,0.1),0px_1px_2px_-1px_rgba(0,0,0,0.1)]">
      {/* Hero (cover image when present, otherwise the patterned blue fallback) */}
      <div className="relative h-[224px] overflow-hidden bg-patriota-pure">
        {coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageVariant(coverImageUrl, "large") ?? coverImageUrl}
            alt={title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(15.68deg, rgba(255,204,102,1) 0%, rgba(255,204,102,1) 3.54%, rgba(255,204,102,0) 3.54%, rgba(255,204,102,0) 50%)",
              opacity: 0.2,
            }}
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"
        />
        <div className="absolute inset-x-0 bottom-0 p-6 text-white">
          <div className="flex items-center gap-3">
            <span className="rounded-[4px] bg-patriota-accent px-2 py-1 text-[10px] font-black uppercase tracking-[0.25px] text-patriota-ink-deep">
              {category}
            </span>
            <span className="text-[12px] text-white/60">{time}</span>
            <span aria-hidden className="text-white/40">·</span>
            <span className="text-[12px] text-white/60">
              {readMinutes} min leitura
            </span>
          </div>
          <h3 className="mt-3 max-w-[700px] text-[20px] font-black leading-[27.5px]">
            {title}
          </h3>
        </div>
      </div>
      {/* Footer with excerpt + author */}
      <div className="px-6 py-6">
        <p className="text-[16px] leading-[26px] text-[#4a5565]">{excerpt}</p>
        <div className="mt-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-patriota-pure text-[12px] font-bold text-patriota-accent">
              {author.initials}
            </span>
            <div className="text-[12px] leading-tight">
              <p className="font-semibold text-[#1e2939]">{author.name}</p>
              <p className="text-[10px] text-[#99a1af]">{publishedAt}</p>
            </div>
          </div>
          <a
            href={slug ? `/artigo/${slug}` : "#"}
            className="text-[12px] font-bold text-patriota-pure hover:opacity-80"
          >
            Ler artigo →
          </a>
        </div>
      </div>
    </article>
  );
}
