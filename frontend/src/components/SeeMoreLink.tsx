import Link from "next/link";

/**
 * The "Ver mais" under a block that only shows the first few articles —
 * leads to the full, paginated listing.
 */
export function SeeMoreLink({
  href,
  label = "Ver mais",
}: {
  href: string;
  label?: string;
}) {
  return (
    <div className="mt-6 flex justify-center">
      <Link
        href={href}
        className="group inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-[13px] font-bold text-patriota-dark transition-all duration-300 hover:-translate-y-0.5 hover:border-patriota-medium hover:text-patriota-medium hover:shadow-[0_6px_20px_-8px_rgba(15,44,107,0.18)]"
      >
        {label}
        <span
          aria-hidden
          className="inline-block transition-transform duration-300 group-hover:translate-x-1"
        >
          →
        </span>
      </Link>
    </div>
  );
}
