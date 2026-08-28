import { cache } from "react";
import { apiBaseUrl } from "./api-base";

export interface CategoryDef {
  id: string;
  slug: string;
  label: string;
  description: string;
  color: string;
  icon: string;
  depth: number;
  parentId: string | null;
  /** Articles filed directly in this category. */
  articleCount: number;
  /** …plus everything in its subtree — what the reader actually gets. */
  articleCountTotal: number;
  children: CategoryDef[];
}

interface BackendNode {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  depth: number;
  parentId: string | null;
  articleCount: number;
  articleCountTotal: number;
  children: BackendNode[];
}

function adapt(n: BackendNode): CategoryDef {
  return {
    id: n.id,
    slug: n.slug,
    label: n.name,
    description: n.description,
    color: n.color,
    icon: n.icon,
    depth: n.depth,
    parentId: n.parentId,
    articleCount: n.articleCount ?? 0,
    articleCountTotal: n.articleCountTotal ?? n.articleCount ?? 0,
    children: (n.children ?? []).map(adapt),
  };
}

/**
 * The visible category tree, nested, from `GET /public/categories/tree`.
 *
 * Wrapped in React's `cache()` so one request reuses the same payload
 * across the header, the hero, the sidebar and the breadcrumb rather
 * than fetching four times.
 */
export const getCategoryTree = cache(async (): Promise<CategoryDef[]> => {
  try {
    const res = await fetch(`${apiBaseUrl()}/public/categories/tree`, {
      cache: "no-store",
    });
    if (!res.ok) {
      // Loud on purpose. An empty tree renders the site with no
      // navigation AND a generateStaticParams with zero routes — a
      // silent catch here turns a backend blip into a site that looks
      // deliberately empty.
      console.error(
        `[categories] /public/categories/tree respondeu ${res.status}`,
      );
      return [];
    }
    return ((await res.json()) as BackendNode[]).map(adapt);
  } catch (err) {
    console.error("[categories] árvore de categorias inacessível:", err);
    return [];
  }
});

/** Every node, depth-first — the order they read in a menu. */
export const getAllCategories = cache(async (): Promise<CategoryDef[]> => {
  const flatten = (nodes: CategoryDef[]): CategoryDef[] =>
    nodes.flatMap((n) => [n, ...flatten(n.children)]);
  return flatten(await getCategoryTree());
});

/** Top-level sections only. */
export async function getRootCategories(): Promise<CategoryDef[]> {
  return getCategoryTree();
}

export async function getCategoryBySlug(
  slug: string,
): Promise<CategoryDef | undefined> {
  return (await getAllCategories()).find((c) => c.slug === slug);
}

/**
 * Root → … → the category itself. Drives both the visible breadcrumb and
 * its BreadcrumbList JSON-LD, which is how Google reads the hierarchy —
 * the URLs stay flat, so this trail is the only place the structure is
 * expressed to a crawler.
 */
export async function getAncestors(slug: string): Promise<CategoryDef[]> {
  const all = await getAllCategories();
  const byId = new Map(all.map((c) => [c.id, c]));
  let node = all.find((c) => c.slug === slug);
  const trail: CategoryDef[] = [];
  while (node) {
    trail.unshift(node);
    node = node.parentId ? byId.get(node.parentId) : undefined;
  }
  return trail;
}

/** The category's own children — the chips that let a reader descend. */
export async function getChildren(slug: string): Promise<CategoryDef[]> {
  return (await getCategoryBySlug(slug))?.children ?? [];
}

/**
 * Everything alongside the current node, itself excluded.
 *
 * Siblings rather than a flat "other sections" list: a reader on the
 * Funchal wants Câmara de Lobos, not Desporto. Roots fall back to the
 * other roots, which is what the old list happened to be.
 */
export async function getSiblings(slug: string): Promise<CategoryDef[]> {
  const all = await getAllCategories();
  const node = all.find((c) => c.slug === slug);
  if (!node) return [];
  return all.filter((c) => c.parentId === node.parentId && c.id !== node.id);
}

/**
 * Maximum number of TOP-LEVEL categories in the primary <SiteHeader> nav.
 * Anything beyond falls through to <SecondaryNav>, which pages through
 * the overflow with a dot indicator rather than growing.
 *
 * Six is a deliberate editorial choice, not a technical ceiling: it is
 * the masthead the newsroom recognises. Subcategories never enter either
 * bar — they live in the section panel — so letting the primary grow
 * would only push top-level sections around for no gain.
 */
export const PRIMARY_NAV_LIMIT = 6;

export async function getNavCategories(): Promise<{
  primary: CategoryDef[];
  secondary: CategoryDef[];
}> {
  const roots = await getRootCategories();
  return {
    primary: roots.slice(0, PRIMARY_NAV_LIMIT),
    secondary: roots.slice(PRIMARY_NAV_LIMIT),
  };
}
