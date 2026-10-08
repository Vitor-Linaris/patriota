import { ArticleCardImage } from "../ArticleCardImage";

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

/**
 * One row of a category or listing page.
 *
 * Phones: the photo first, full width, then the number and the text.
 * From `sm:` up: the photo as a column down the left side of the card,
 * as tall as the card (ArticleCardImage), then the number and the text.
 */
export function ArticleListItem({ item }: { item: ArticleListItemData }) {
  return (
    <a
      href={item.slug ? `/artigo/${item.slug}` : "#"}
      className="group flex flex-col overflow-hidden rounded-[12px] border border-[#f3f4f6] bg-white shadow-[0px_1px_3px_0px_rgba(0,0,0,0.05)] transition-all duration-300 hover:-translate-y-0.5 hover:border-patriota-medium hover:shadow-[0_6px_20px_-8px_rgba(15,44,107,0.18)] sm:flex-row"
    >
      <ArticleCardImage
        url={item.coverImageUrl}
        side="sm:w-56 sm:min-h-[176px] lg:w-72"
        placeholder="brand"
      />
      <div className="flex min-w-0 flex-1 items-center gap-4 p-4 sm:p-5">
        <span className="w-6 shrink-0 self-start text-[20px] font-black leading-none text-patriota-accent">
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
          <h3 className="mt-2 text-[17px] font-bold leading-[23px] text-[#101828] transition-colors duration-200 group-hover:text-patriota-medium lg:text-[18px] lg:leading-[25px]">
            {item.title}
          </h3>
          <p className="mt-1.5 line-clamp-2 text-[14px] leading-[20px] text-[#6a7282] lg:line-clamp-3">
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
      </div>
    </a>
  );
}
