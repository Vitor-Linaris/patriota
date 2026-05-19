import { cache } from "react";

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

function getApiUrl(): string {
  return (
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://api:8585"
  );
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
    const res = await fetch(`${getApiUrl()}/public/categories`, {
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
