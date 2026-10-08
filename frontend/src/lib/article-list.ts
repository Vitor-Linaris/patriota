import type { ArticleListItemData } from "@/components/category/ArticleListItem";
import { timeAgo, type ArticleSummary } from "./public-api";

/**
 * How many articles a full listing (/ultimas-noticias, /categoria/…/todos)
 * shows per page.
 */
export const LISTING_PAGE_SIZE = 10;

/**
 * How many a summary block shows before its "Ver mais" — the homepage's
 * "Últimas Notícias" and a category's list under its featured article.
 */
export const PREVIEW_COUNT = 8;

export function initialsOf(name: string | null | undefined): string {
  if (!name) return "??";
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? "")
    .join("");
}

/** One article as a row of ArticleListItem. `number` is its position on screen. */
export function toListItem(
  a: ArticleSummary,
  number: number,
): ArticleListItemData {
  return {
    number,
    category: a.category.name.toUpperCase(),
    time: timeAgo(a.publishedAt),
    readMinutes: a.readMinutes,
    title: a.title,
    excerpt: a.summary,
    authorInitials: initialsOf(a.author.name),
    authorName: a.author.name ?? "Redação",
    date: timeAgo(a.publishedAt),
    slug: a.slug,
    coverImageUrl: a.coverImageUrl,
  };
}

/** `?page=` as a page number: 1-based, anything odd falls back to 1. */
export function pageFromParam(raw: string | undefined): number {
  const n = Number(raw);
  return Number.isInteger(n) && n > 1 ? n : 1;
}
