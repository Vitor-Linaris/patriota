export function Pagination({
  current = 1,
  total = 5,
}: {
  current?: number;
  total?: number;
}) {
  const pages = Array.from({ length: total }, (_, i) => i + 1);
  return (
    <nav
      aria-label="Paginação"
      className="flex items-center justify-center gap-2 py-8"
    >
      <PageButton ariaLabel="Página anterior">←</PageButton>
      {pages.map((p) => (
        <PageButton key={p} active={p === current}>
          {p}
        </PageButton>
      ))}
      <PageButton ariaLabel="Próxima página">→</PageButton>
    </nav>
  );
}

function PageButton({
  children,
  active = false,
  ariaLabel,
}: {
  children: React.ReactNode;
  active?: boolean;
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={
        "flex h-9 w-9 items-center justify-center rounded-md border text-[13px] font-semibold transition " +
        (active
          ? "border-patriota-dark bg-patriota-dark text-white"
          : "border-slate-200 bg-white text-slate-700 hover:border-slate-400")
      }
    >
      {children}
    </button>
  );
}
