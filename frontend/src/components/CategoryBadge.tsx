/**
 * The coloured category chip.
 *
 * Replaces a hardcoded name → Tailwind-class map that listed nine
 * categories (twice for "Investigação", once with the accent and once
 * without — which is what a lookup keyed on a display name gets you).
 * With a four-level tree the newsroom can create dozens of sections, and
 * every one of them would have fallen through to grey.
 *
 * The colour now comes from the category row the admin picks in
 * /admin/categorias, so it is right by construction and needs no upkeep.
 */
export function CategoryBadge({
  name,
  color,
  size = "md",
  className = "",
}: {
  name: string;
  color?: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const sizing =
    size === "sm"
      ? "px-1.5 py-0.5 text-[9px]"
      : "px-2 py-1 text-[10px]";
  return (
    <span
      className={`rounded font-bold uppercase tracking-wider text-white ${sizing} ${className}`}
      // Falls back to the neutral slate the old map used when a payload
      // predates the colour field.
      style={{ backgroundColor: color || "#475569" }}
    >
      {name}
    </span>
  );
}
