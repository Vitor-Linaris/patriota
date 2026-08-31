import { AdminShell } from "../AdminShell";
import AdminArticlesClient, {
  type AdminArticle,
  type CategoryOption,
} from "./AdminArticlesClient";
import { apiFetch } from "@/lib/api";

interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface ArticleApi {
  id: string;
  slug: string;
  title: string;
  summary: string;
  content: string;
  status: "RASCUNHO" | "EM_REVISAO" | "AGENDADO" | "PUBLICADO" | "ARQUIVADO";
  exclusive: boolean;
  views: number;
  readMinutes: number;
  tags: string[];
  essentials: string[];
  context: { columns: { label: string; body: string }[] } | null;
  pullQuote: { quote: string; cite: string } | null;
  metaTitle: string | null;
  metaDescription: string | null;
  coverImageUrl: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  rejectionReason: string | null;
  /** Parked edits to a live article — see ArticlesService.saveDraft. */
  draft: Record<string, unknown> | null;
  draftUpdatedAt: string | null;
  draftAwaitingReview: boolean;
  createdAt: string;
  categoryId: string;
  category: { slug: string; name: string; color: string } | null;
  author: { id: string; name: string | null; email: string } | null;
}

interface MeWithPerms {
  id: string;
  email: string;
  name: string | null;
  role: string;
  permissions: string[];
}

interface CategoryApi {
  id: string;
  slug: string;
  name: string;
  color: string;
}

function toAdminArticle(a: ArticleApi): AdminArticle {
  return {
    id: a.id,
    title: a.title,
    slug: a.slug,
    summary: a.summary ?? "",
    content: a.content ?? "",
    status: a.status,
    exclusive: a.exclusive,
    views: a.views,
    readMinutes: a.readMinutes,
    tags: a.tags ?? [],
    essentials: a.essentials ?? [],
    context: a.context ?? null,
    pullQuote: a.pullQuote ?? null,
    metaTitle: a.metaTitle ?? "",
    metaDescription: a.metaDescription ?? "",
    coverImage: a.coverImageUrl ?? "",
    scheduledAt: a.scheduledAt,
    draft: a.draft ?? null,
    draftUpdatedAt: a.draftUpdatedAt ?? null,
    draftAwaitingReview: a.draftAwaitingReview ?? false,
    createdAt: a.createdAt,
    publishedAt: a.publishedAt,
    rejectionReason: a.rejectionReason ?? null,
    categoryId: a.categoryId,
    categoryName: a.category?.name ?? "—",
    categoryColor: a.category?.color ?? "#6b7280",
    authorName: a.author?.name ?? a.author?.email ?? "—",
  };
}

const PAGE_SIZE = 20;
const STATUSES = [
  "RASCUNHO",
  "EM_REVISAO",
  "AGENDADO",
  "PUBLICADO",
  "ARQUIVADO",
] as const;
type ApiStatus = (typeof STATUSES)[number];

interface StatsResponse {
  total: number;
  byStatus: Record<ApiStatus, number>;
  totalViews: number;
}

export default async function AdminArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    q?: string;
    status?: string;
    /** When set, the client opens the editor on mount with this
     *  article loaded. Used by deep links from /admin/media. */
    edit?: string;
  }>;
}) {
  const { page: pageParam, q: qParam, status: statusParam, edit: editParam } =
    await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const q = (qParam ?? "").trim();
  const status = STATUSES.includes(statusParam as ApiStatus)
    ? (statusParam as ApiStatus)
    : null;

  // Build the list URL with all active filters so the backend can do
  // the real work — text search across title/summary, status filter,
  // and pagination. The previous implementation searched only the
  // currently loaded page, which broke as soon as the corpus exceeded
  // one page.
  const listParams = new URLSearchParams();
  listParams.set("page", String(page));
  listParams.set("pageSize", String(PAGE_SIZE));
  if (q) listParams.set("q", q);
  if (status) listParams.set("status", status);

  const [articlesRes, categoriesRes, meRes, statsRes] = await Promise.all([
    apiFetch(`/admin/articles?${listParams.toString()}`),
    apiFetch("/admin/categories"),
    apiFetch("/auth/me"),
    // Stats endpoint covers the WHOLE corpus regardless of paging or
    // filters — fixes "Publicados: 20" turning into "12" on page 2.
    apiFetch("/admin/articles/stats"),
  ]);
  const articlesBody = articlesRes.ok
    ? ((await articlesRes.json()) as PageResult<ArticleApi>)
    : { items: [], total: 0, page: 1, pageSize: PAGE_SIZE };
  const articles = articlesBody.items.map(toAdminArticle);
  const categories = categoriesRes.ok
    ? ((await categoriesRes.json()) as CategoryApi[]).map<CategoryOption>(
        (c) => ({ id: c.id, name: c.name, slug: c.slug, color: c.color }),
      )
    : [];
  const me = meRes.ok ? ((await meRes.json()) as MeWithPerms) : null;
  const canPublish =
    me?.role === "SUPER_ADMIN" ||
    me?.permissions?.includes("artigos.publicar") ||
    false;
  const canApprove =
    me?.role === "SUPER_ADMIN" ||
    me?.permissions?.includes("artigos.aprovar") ||
    false;
  const totalPages = Math.max(1, Math.ceil(articlesBody.total / PAGE_SIZE));
  const stats = statsRes.ok
    ? ((await statsRes.json()) as StatsResponse)
    : {
        total: 0,
        byStatus: {} as Record<ApiStatus, number>,
        totalViews: 0,
      };

  // Deep-link from /admin/media: fetch the requested article so the
  // client can open the editor immediately. We only fetch when the
  // article isn't already on the current page to avoid a redundant
  // round-trip.
  let initialEditArticle: AdminArticle | null = null;
  if (editParam) {
    const onPage = articles.find((a) => a.id === editParam);
    if (onPage) {
      initialEditArticle = onPage;
    } else {
      const oneRes = await apiFetch(`/admin/articles/${editParam}`);
      if (oneRes.ok) {
        initialEditArticle = toAdminArticle(
          (await oneRes.json()) as ArticleApi,
        );
      }
    }
  }

  return (
    <AdminShell active="/admin/artigos">
      <AdminArticlesClient
        initialArticles={articles}
        totalArticles={articlesBody.total}
        currentPage={page}
        totalPages={totalPages}
        searchQuery={q}
        activeStatus={status}
        statsTotal={stats.total}
        statsByStatus={stats.byStatus}
        statsTotalViews={stats.totalViews}
        categories={categories}
        canPublish={canPublish}
        canApprove={canApprove}
        initialEditArticle={initialEditArticle}
      />
    </AdminShell>
  );
}
