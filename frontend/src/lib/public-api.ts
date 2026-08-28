import { cache } from "react";
import { mapApiAdToUi, type Ad, type AdApi } from "./ads";
import { apiBaseUrl } from "./api-base";

export interface ArticleSummary {
  id: string;
  slug: string;
  title: string;
  summary: string;
  status: "RASCUNHO" | "AGENDADO" | "PUBLICADO" | "ARQUIVADO";
  premium: boolean;
  views: number;
  readMinutes: number;
  tags: string[];
  publishedAt: string | null;
  scheduledAt: string | null;
  coverImageUrl: string | null;
  /** Denormalised count of APPROVED comments — drives the counter badge. */
  commentCount: number;
  // color comes from the category row the admin edits, so a badge is
  // right for any category that ever exists — the old lookup was keyed
  // by category NAME and turned every new section grey.
  category: { slug: string; name: string; color?: string };
  author: { name: string | null };
}

export interface ArticleContextColumn {
  label: string;
  body: string;
}

export interface ArticlePullQuote {
  quote: string;
  cite: string;
}

export interface ArticleDetail extends ArticleSummary {
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
  essentials: string[];
  context: { columns: ArticleContextColumn[] } | null;
  pullQuote: ArticlePullQuote | null;
  categoryId?: string;
  // PHASE 2 (paywall): the backend will return a truncated contentPreview
  // and omit content entirely for non-subscribers. Declared now so the
  // switch is a backend change only — a CSS blur or a client-side slice
  // is defeated by View Source.
  paywalled?: boolean;
  contentPreview?: string;
}

export interface HomepageBundle {
  featured: ArticleDetail | null;
  side: ArticleSummary[];
  latest: ArticleSummary[];
  investigation: ArticleSummary[];
}

export const getHomepage = cache(
  async (): Promise<HomepageBundle> => {
    try {
      const res = await fetch(`${apiBaseUrl()}/public/homepage`, {
        cache: "no-store",
      });
      if (!res.ok) {
        return { featured: null, side: [], latest: [], investigation: [] };
      }
      return (await res.json()) as HomepageBundle;
    } catch {
      return { featured: null, side: [], latest: [], investigation: [] };
    }
  },
);

export async function getArticleBySlug(
  slug: string,
): Promise<ArticleDetail | null> {
  try {
    const res = await fetch(
      `${apiBaseUrl()}/public/articles/by-slug/${encodeURIComponent(slug)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    return (await res.json()) as ArticleDetail;
  } catch {
    return null;
  }
}

export interface PublicListQuery {
  category?: string;
  /** Free-text search across title + summary. */
  q?: string;
  page?: number;
  pageSize?: number;
  sort?: "publishedAt" | "views";
}

export async function listPublicArticles(
  q: PublicListQuery = {},
): Promise<{ items: ArticleSummary[]; total: number }> {
  try {
    const params = new URLSearchParams();
    if (q.category) params.set("category", q.category);
    if (q.q) params.set("q", q.q);
    if (q.page) params.set("page", String(q.page));
    if (q.pageSize) params.set("pageSize", String(q.pageSize));
    if (q.sort) params.set("sort", q.sort);
    const res = await fetch(
      `${apiBaseUrl()}/public/articles?${params.toString()}`,
      { cache: "no-store" },
    );
    if (!res.ok) return { items: [], total: 0 };
    const body = (await res.json()) as {
      items: ArticleSummary[];
      total: number;
    };
    return body;
  } catch {
    return { items: [], total: 0 };
  }
}

/** Most-viewed published articles, descending. */
export async function listMostRead(limit = 4): Promise<ArticleSummary[]> {
  const { items } = await listPublicArticles({
    sort: "views",
    pageSize: limit,
  });
  return items;
}

/** Latest published articles for the breaking-news ticker. */
export async function listBreaking(limit = 3): Promise<ArticleSummary[]> {
  const { items } = await listPublicArticles({ pageSize: limit });
  return items;
}

/** Sibling published articles in the same category as `slug`. */
export async function listRelated(
  slug: string,
  limit = 4,
): Promise<ArticleSummary[]> {
  try {
    const res = await fetch(
      `${apiBaseUrl()}/public/articles/related/${encodeURIComponent(slug)}?limit=${limit}`,
      { cache: "no-store" },
    );
    if (!res.ok) return [];
    return (await res.json()) as ArticleSummary[];
  } catch {
    return [];
  }
}

/**
 * Fetch all enabled ads for a page bucket ("Homepage" | "Artigo" |
 * "Categoria") and return them keyed by slot id, so consumers can do
 * `ads["homepage-leaderboard"]` without scanning an array each time.
 * Cached per request via `react.cache` so calling this from multiple
 * server components in the same request doesn't multiply round-trips.
 *
 * Disabled / EMPTY slots are filtered out at the API layer; if they
 * leak through we still treat them as "no ad" in <AdSlot/>.
 */
export const getAdsByPage = cache(
  async (page: "Homepage" | "Artigo" | "Categoria"): Promise<Record<string, Ad>> => {
    try {
      const res = await fetch(
        `${apiBaseUrl()}/public/ads/${encodeURIComponent(page)}`,
        { cache: "no-store" },
      );
      if (!res.ok) return {};
      const raw = (await res.json()) as AdApi[];
      const map: Record<string, Ad> = {};
      for (const api of raw) map[api.id] = mapApiAdToUi(api);
      return map;
    } catch {
      return {};
    }
  },
);

export interface SocialLinks {
  twitter?: string;
  facebook?: string;
  instagram?: string;
  linkedin?: string;
  youtube?: string;
}

/** Fetch the public `redes` settings section so the footer can
 *  render the social icons. Returns empty object on error so the
 *  footer simply hides every icon rather than blowing up. */
export const getSocialLinks = cache(async (): Promise<SocialLinks> => {
  try {
    const res = await fetch(`${apiBaseUrl()}/public/settings/redes`, {
      cache: "no-store",
    });
    if (!res.ok) return {};
    const data = (await res.json()) as Partial<SocialLinks>;
    return {
      twitter: data.twitter || undefined,
      facebook: data.facebook || undefined,
      instagram: data.instagram || undefined,
      linkedin: data.linkedin || undefined,
      youtube: data.youtube || undefined,
    };
  } catch {
    return {};
  }
});

export function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const min = Math.round(diffMs / 60000);
  if (min < 1) return "Agora mesmo";
  if (min < 60) return `Há ${min} minuto${min === 1 ? "" : "s"}`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `Há ${hr} hora${hr === 1 ? "" : "s"}`;
  const day = Math.round(hr / 24);
  return day === 1 ? "Ontem" : `Há ${day} dias`;
}

export interface PublicComment {
  id: string;
  /** null when the comment was removed — the row stays so replies keep their anchor. */
  body: string | null;
  status: "PENDENTE" | "APROVADO" | "REJEITADO" | "SPAM" | "ELIMINADO";
  parentId: string | null;
  createdAt: string;
  editedAt: string | null;
  author: { name: string; isMe: boolean };
}

/**
 * Comment thread for an article, rendered server-side so it is indexable.
 *
 * The reader token is passed through when there is one, purely so an
 * author sees their own still-PENDENTE comment; anonymous callers get the
 * approved ones. Errors are swallowed into an empty thread — a comments
 * outage must never take the article down with it, same contract as
 * getHomepage and the rest of this file.
 */
export async function listComments(
  slug: string,
  token?: string | null,
  pageSize = 50,
): Promise<{ items: PublicComment[]; total: number }> {
  try {
    const res = await fetch(
      `${apiBaseUrl()}/public/articles/${encodeURIComponent(slug)}/comments?pageSize=${pageSize}`,
      {
        cache: "no-store",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      },
    );
    if (!res.ok) return { items: [], total: 0 };
    const data = (await res.json()) as { items?: PublicComment[]; total?: number };
    return { items: data.items ?? [], total: data.total ?? 0 };
  } catch {
    return { items: [], total: 0 };
  }
}
