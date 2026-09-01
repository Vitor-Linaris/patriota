import { AdminShell } from "../AdminShell";
import AdminMediaClient, { type MediaItem } from "./AdminMediaClient";
import { apiFetch } from "@/lib/api";

interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface MediaApi {
  id: string;
  url: string;
  urlMedium: string | null;
  urlSmall: string | null;
  name: string;
  mimeType: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  uploadedAt: string;
  /** Who put it there. Null for files left by staff who have gone. */
  uploadedBy: { id: string; name: string | null } | null;
  /** Count of articles that reference this media (cover or inline). */
  articleCount: number;
  /** Count of ad slots whose imageUrl points at this media. */
  adCount: number;
  /** First 5 places using this media — mix of articles and ads. */
  usedIn: Array<
    | { kind: "article"; id: string; slug: string; title: string }
    | { kind: "ad"; id: string; title: string }
  >;
}

const dateFmt = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function humanSize(bytes: number | null): string | undefined {
  if (bytes == null) return undefined;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function toMediaItem(m: MediaApi): MediaItem {
  return {
    id: m.id,
    url: m.url,
    name: m.name,
    uploadedAt: dateFmt.format(new Date(m.uploadedAt)),
    size: humanSize(m.size),
    dimensions:
      m.width && m.height ? `${m.width}×${m.height}` : undefined,
    articleCount: m.articleCount ?? 0,
    adCount: m.adCount ?? 0,
    usedIn: m.usedIn ?? [],
    uploadedBy: m.uploadedBy?.name ?? null,
  };
}

const PAGE_SIZE = 24;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string; scope?: string }>;
}) {
  const { page: pageParam, q: qParam, scope: scopeParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const q = (qParam ?? "").trim();
  // Anything unrecognised is dropped rather than forwarded: the API
  // rejects unknown query params outright (forbidNonWhitelisted), so a
  // typo in a bookmark would render an empty page instead of a library.
  const scope = scopeParam === "todas" ? "todas" : undefined;

  const listParams = new URLSearchParams();
  listParams.set("page", String(page));
  listParams.set("pageSize", String(PAGE_SIZE));
  if (q) listParams.set("q", q);
  if (scope) listParams.set("scope", scope);

  // Fire the page query AND a no-search count query in parallel — the
  // latter feeds the "X imagens no total" stat (always the full
  // library count, ignores the search filter).
  const [res, totalRes, meRes] = await Promise.all([
    apiFetch(`/admin/media?${listParams.toString()}`),
    // The stat card's denominator. Same scope as the list, so "de X no
    // total" never counts files the grid below cannot show.
    apiFetch(`/admin/media?pageSize=1${scope ? "&scope=todas" : ""}`),
    // Only to decide whether to offer the "toda a equipa" filter. The
    // API refuses scope=todas to anyone else regardless.
    apiFetch("/auth/me"),
  ]);
  const body = res.ok
    ? ((await res.json()) as PageResult<MediaApi>)
    : { items: [], total: 0, page: 1, pageSize: PAGE_SIZE };
  const totalLibrary = totalRes.ok
    ? ((await totalRes.json()) as PageResult<MediaApi>).total
    : body.total;
  const me = meRes.ok
    ? ((await meRes.json()) as { role?: string })
    : {};
  const canSeeAll = me.role === "SUPER_ADMIN";
  const items = body.items.map(toMediaItem);
  const totalPages = Math.max(1, Math.ceil(body.total / PAGE_SIZE));
  return (
    <AdminShell active="/admin/media">
      <AdminMediaClient
        initialItems={items}
        totalItems={body.total}
        statsTotal={totalLibrary}
        currentPage={page}
        totalPages={totalPages}
        searchQuery={q}
        scope={scope === "todas" ? "todas" : "minha"}
        canSeeAll={canSeeAll}
      />
    </AdminShell>
  );
}
