import { cache } from "react";

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
  category: { slug: string; name: string };
  author: { name: string | null };
}

export interface ArticleDetail extends ArticleSummary {
  content: string;
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface HomepageBundle {
  featured: ArticleDetail | null;
  side: ArticleSummary[];
  latest: ArticleSummary[];
  investigation: ArticleSummary[];
}

function apiUrl(): string {
  return (
    process.env.INTERNAL_API_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://api:8585"
  );
}

export const getHomepage = cache(
  async (): Promise<HomepageBundle> => {
    try {
      const res = await fetch(`${apiUrl()}/public/homepage`, {
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
      `${apiUrl()}/public/articles/by-slug/${encodeURIComponent(slug)}`,
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
  page?: number;
  pageSize?: number;
}

export async function listPublicArticles(
  q: PublicListQuery = {},
): Promise<{ items: ArticleSummary[]; total: number }> {
  try {
    const params = new URLSearchParams();
    if (q.category) params.set("category", q.category);
    if (q.page) params.set("page", String(q.page));
    if (q.pageSize) params.set("pageSize", String(q.pageSize));
    const res = await fetch(
      `${apiUrl()}/public/articles?${params.toString()}`,
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
