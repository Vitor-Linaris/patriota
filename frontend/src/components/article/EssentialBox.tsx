export function EssentialBox({ items }: { items: string[] }) {
  return (
    <aside className="rounded-r-lg border-l-4 border-patriota-accent bg-slate-50 px-6 py-5">
      <h2 className="text-[16px] font-black uppercase tracking-wide text-patriota-dark">
        O Essencial
      </h2>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((it) => (
          <li
            key={it}
            className="flex gap-3 text-[14px] leading-relaxed text-slate-700"
          >
            <span
              aria-hidden
              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-patriota-accent"
            />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
