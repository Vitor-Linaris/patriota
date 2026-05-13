export function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4">
      <span aria-hidden className="h-6 w-1 rounded-full bg-orange-500" />
      <h2 className="text-xl font-black text-slate-900">{children}</h2>
      <span aria-hidden className="h-px flex-1 bg-slate-200" />
    </div>
  );
}
