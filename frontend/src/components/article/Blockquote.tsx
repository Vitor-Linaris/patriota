export function Blockquote({
  quote,
  cite,
}: {
  quote: string;
  cite: string;
}) {
  return (
    <blockquote className="border-l-4 border-patriota-accent bg-slate-50/50 py-4 pl-6 pr-4">
      <p className="text-[20px] font-medium italic leading-snug text-patriota-dark">
        &ldquo;{quote}&rdquo;
      </p>
      <cite className="mt-3 block text-[13px] not-italic text-slate-500">
        {cite}
      </cite>
    </blockquote>
  );
}
