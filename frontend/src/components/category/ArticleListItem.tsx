import { imageVariant } from "@/lib/images";

export interface ArticleListItemData {
  number: number;
  category: string;
  time: string;
  readMinutes: number;
  title: string;
  excerpt: string;
  authorInitials: string;
  authorName: string;
  date: string;
  slug?: string;
  coverImageUrl?: string | null;
}

export function ArticleListItem({ item }: { item: ArticleListItemData }) {
  return (
    <a
      href={item.slug ? `/artigo/${item.slug}` : "#"}
      className="group flex gap-5 rounded-[12px] border border-[#f3f4f6] bg-white p-5 shadow-[0px_1px_3px_0px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:border-patriota-medium hover:shadow-[0_6px_20px_-8px_rgba(15,44,107,0.18)]"
    >
      <span className="w-6 shrink-0 text-[20px] font-black leading-none text-patriota-accent">
        {item.number}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="text-[10px] font-bold uppercase tracking-[0.25px] text-patriota-ink-deep">
            {item.category}
          </span>
          <span aria-hidden className="text-[#d1d5dc]">·</span>
          <span className="text-[#99a1af]">{item.time}</span>
          <span aria-hidden className="text-[#d1d5dc]">·</span>
          <span className="text-[#99a1af]">
            {item.readMinutes} min leitura
          </span>
        </div>
        <h3 className="mt-2 text-[16px] font-bold leading-[22px] text-[#101828] transition-colors duration-200 group-hover:text-patriota-medium">
          {item.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-[14px] leading-[20px] text-[#6a7282]">
          {item.excerpt}
        </p>
        <div className="mt-3 flex items-center gap-2 text-[12px]">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-patriota-pure text-[10px] font-bold text-patriota-accent">
            {item.authorInitials}
          </span>
          <span className="text-[#6a7282]">{item.authorName}</span>
          <span aria-hidden className="text-[#d1d5dc]">·</span>
          <span className="text-[#99a1af]">{item.date}</span>
        </div>
      </div>
      {item.coverImageUrl ? (
        <div className="hidden h-20 w-28 shrink-0 overflow-hidden rounded-[8px] sm:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageVariant(item.coverImageUrl, "small") ?? item.coverImageUrl}
            alt=""
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
          />
        </div>
      ) : (
        <div
          aria-hidden
          className="hidden h-20 w-28 shrink-0 rounded-[8px] sm:block"
          style={{
            background:
              "linear-gradient(144.46deg, rgba(15,44,107,0.1) 0%, rgba(255,204,102,0.15) 100%)",
          }}
        />
      )}
    </a>
  );
}
