/**
 * The category catalogue, as a <select> wants it.
 *
 * `/admin/categories/options` answers with the nested forest, because a
 * tree is what the catalogue IS. Every picker in the admin then has to
 * flatten it the same way, and until now two of them did it with two
 * copies of the same function — which is how one of them ends up sorted
 * differently from the other after somebody "tidies" it.
 */
export interface CategoryTreeApi {
  id: string;
  slug: string;
  name: string;
  color: string;
  depth: number;
  children: CategoryTreeApi[];
}

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  color: string;
  /** 0 for a top-level category, 1 for a subcategory, and so on. */
  depth: number;
}

/**
 * Parent before children, in tree order — the same order the
 * drag-and-drop screen at /admin/categorias shows, so a "Sé" sits right
 * under the "Funchal" it belongs to instead of being alphabetised into a
 * different part of the list.
 */
export function flattenCategoryTree(
  nodes: CategoryTreeApi[],
): CategoryOption[] {
  const out: CategoryOption[] = [];
  for (const n of nodes) {
    out.push({
      id: n.id,
      name: n.name,
      slug: n.slug,
      color: n.color,
      depth: n.depth,
    });
    out.push(...flattenCategoryTree(n.children));
  }
  return out;
}

/**
 * The visual nesting inside an <option>.
 *
 * A `<select>` cannot be indented with CSS in any way that survives the
 * native dropdown on every platform, so the indentation has to be in the
 * text. Figure spaces rather than plain ones: they are non-breaking and
 * fixed-width, which keeps the steps aligned in the OS renderer.
 */
export function indentOption(name: string, depth: number): string {
  return depth > 0 ? `${" ".repeat(depth * 2)}${name}` : name;
}
