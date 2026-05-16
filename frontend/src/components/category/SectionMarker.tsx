export function SectionMarker({
  title,
  trailing,
}: {
  title: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3">
      <span aria-hidden className="h-6 w-1 rounded-full bg-orange-500" />
      <h2 className="text-[20px] font-black text-slate-900">{title}</h2>
      {trailing}
    </div>
  );
}
