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
  premium: boolean;
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
    premium: a.premium,
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
    createdAt: a.createdAt,
    publishedAt: a.publishedAt,
    rejectionReason: a.rejectionReason ?? null,
    categoryId: a.categoryId,
    categoryName: a.category?.name ?? "—",
    categoryColor: a.category?.color ?? "#6b7280",
    authorName: a.author?.name ?? a.author?.email ?? "—",
  };
}

export default async function AdminArticlesPage() {
  const [articlesRes, categoriesRes, meRes] = await Promise.all([
    apiFetch("/admin/articles?pageSize=100"),
    apiFetch("/admin/categories"),
    apiFetch("/auth/me"),
  ]);
  const articles = articlesRes.ok
    ? ((await articlesRes.json()) as PageResult<ArticleApi>).items.map(
        toAdminArticle,
      )
    : [];
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

  return (
    <AdminShell active="/admin/artigos">
      <AdminArticlesClient
        initialArticles={articles}
        categories={categories}
        canPublish={canPublish}
        canApprove={canApprove}
      />
    </AdminShell>
  );
}
