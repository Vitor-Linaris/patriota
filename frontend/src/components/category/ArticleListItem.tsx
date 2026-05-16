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
}

export function ArticleListItem({ item }: { item: ArticleListItemData }) {
  return (
    <a
      href="#"
      className="flex gap-5 rounded-lg border border-slate-200 bg-white p-5 transition hover:shadow-md"
    >
      <span className="w-6 shrink-0 text-[20px] font-black leading-none text-slate-300">
        {item.number}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-slate-500">
          <span className="text-[10px] font-bold uppercase tracking-wider text-red-600">
            {item.category}
          </span>
          <span aria-hidden>·</span>
          <span>{item.time}</span>
          <span aria-hidden>·</span>
          <span>{item.readMinutes} min leitura</span>
        </div>
        <h3 className="mt-2 text-[16px] font-bold leading-snug text-slate-900">
          {item.title}
        </h3>
        <p className="mt-1 line-clamp-2 text-[13px] text-slate-600">
          {item.excerpt}
        </p>
        <div className="mt-3 flex items-center gap-2 text-[12px] text-slate-500">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-patriota-medium text-[10px] font-bold text-white">
            {item.authorInitials}
          </span>
          <span className="font-semibold text-slate-700">
            {item.authorName}
          </span>
          <span aria-hidden>·</span>
          <span>{item.date}</span>
        </div>
      </div>
      <div className="hidden h-20 w-28 shrink-0 rounded-md bg-gradient-to-br from-slate-200 to-slate-300 sm:block" />
    </a>
  );
}
