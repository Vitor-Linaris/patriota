/**
 * Pure helpers for the pacote editor. Tested by package-utils.check.ts,
 * which runs under `npm run check:pacotes` — the house pattern for
 * frontend logic worth pinning (see admin/categorias/tree-utils.check.ts
 * for why there is no test runner here).
 */

/**
 * Euros as typed by a person into cents as stored.
 *
 * A comma is accepted because a Portuguese keyboard types 9,99 and a
 * Portuguese reader writes it that way. Rejecting it, or silently reading
 * "9,99" as 9, is how a €9,99 pacote goes on sale for €9.
 *
 * Returns null for anything that is not a price, so the caller can refuse
 * to save rather than sending 0 or NaN to the API. Note that "0" parses
 * fine here and is a valid number — it is the API that refuses a price
 * under €1,00, because that is a pricing rule and not a parsing one.
 */
export function eurosToCents(input: string): number | null {
  const trimmed = input.trim().replace(/\s|€/g, "");
  if (!trimmed) return null;
  const normalised = trimmed.replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalised)) return null;
  // Rounded, not truncated: 0.1 * 100 is 10.000000000000002 in binary
  // floating point, and Math.trunc of that is 10 by luck rather than by
  // design. Rounding makes the luck unnecessary.
  return Math.round(Number(normalised) * 100);
}

/** Cents back to the string the editor edits. Always two decimals. */
export function centsToEuros(cents: number): string {
  return (cents / 100).toFixed(2).replace(".", ",");
}

/** Cents as the reader sees them. */
export function formatPrice(cents: number, currency = "EUR"): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/**
 * Move one item by `delta` positions, returning a new array.
 *
 * Out-of-range moves are a no-op rather than an error: the ↑ on the first
 * row and the ↓ on the last are disabled in the UI, and a helper that
 * threw would turn a double-click race into a crash.
 */
export function moveItem<T>(items: readonly T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length) return [...items];
  if (target < 0 || target >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved!);
  return next;
}

/** Slug preview, matching the backend's slugify closely enough to show. */
export function slugPreview(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}
