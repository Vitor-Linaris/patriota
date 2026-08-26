import { cache } from "react";
import { apiBaseUrl } from "./api-base";

export interface CategoryDef {
  slug: string;
  label: string;
  description: string;
  subtopics: string[];
  articleCount: number;
}

interface BackendCategory {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  order: number;
  visible: boolean;
  articleCount?: number;
  subtopics: { id: string; label: string; order: number }[];
}

/**
 * Server-side cached fetch of the public category catalogue. Backed by
 * `GET /public/categories`. Falls back to an empty list if the backend
 * is unreachable so SSR doesn't crash on cold-start.
 *
 * Wrapped in React's `cache()` so a single request reuses the same
 * payload across components/layouts.
 */
export const getCategories = cache(async (): Promise<CategoryDef[]> => {
  try {
    const res = await fetch(`${apiBaseUrl()}/public/categories`, {
      cache: "no-store",
    });
    if (!res.ok) return [];
    const items = (await res.json()) as BackendCategory[];
    return items.map((c) => ({
      slug: c.slug,
      label: c.name,
      description: c.description,
      articleCount: c.articleCount ?? 0,
      subtopics: c.subtopics.map((s) => s.label),
    }));
  } catch {
    return [];
  }
});

export async function getCategoryBySlug(
  slug: string,
): Promise<CategoryDef | undefined> {
  const all = await getCategories();
  return all.find((c) => c.slug === slug);
}

/**
 * Maximum number of categories shown in the primary <SiteHeader> nav.
 * Anything beyond this falls through to <SecondaryNav>. Pulled out
 * here so both components agree on the same boundary without one
 * having to import the other.
 *
 * Single source of truth: the backend returns categories sorted by
 * `order asc`, so the first N here is "the top N according to the
 * order the admin chose in /admin/categorias".
 */
export const PRIMARY_NAV_LIMIT = 6;

/**
 * Splits the live category catalogue into the two nav bars. Use
 * this in both SiteHeader and SecondaryNav — keeps the partition
 * logic in one place so they can't disagree.
 */
export async function getNavCategories(): Promise<{
  primary: CategoryDef[];
  secondary: CategoryDef[];
}> {
  const all = await getCategories();
  return {
    primary: all.slice(0, PRIMARY_NAV_LIMIT),
    secondary: all.slice(PRIMARY_NAV_LIMIT),
  };
}
