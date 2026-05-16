interface Column {
  label: string;
  body: string;
}

export function ContextBox({ columns }: { columns: Column[] }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-6">
      <h2 className="text-[14px] font-bold uppercase tracking-wide text-patriota-dark">
        Contexto
      </h2>
      <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3 md:divide-x md:divide-slate-200">
        {columns.map((col, i) => (
          <div key={col.label} className={i > 0 ? "md:pl-6" : ""}>
            <p className="text-[12px] font-semibold uppercase tracking-wide text-slate-500">
              {col.label}
            </p>
            <p className="mt-2 text-[14px] leading-relaxed text-slate-800">
              {col.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
