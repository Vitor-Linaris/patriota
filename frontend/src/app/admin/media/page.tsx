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
  name: string;
  mimeType: string | null;
  size: number | null;
  width: number | null;
  height: number | null;
  uploadedAt: string;
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
    usedIn: [],
  };
}

const PAGE_SIZE = 24;

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; q?: string }>;
}) {
  const { page: pageParam, q: qParam } = await searchParams;
  const page = Math.max(1, Number(pageParam) || 1);
  const q = (qParam ?? "").trim();

  const listParams = new URLSearchParams();
  listParams.set("page", String(page));
  listParams.set("pageSize", String(PAGE_SIZE));
  if (q) listParams.set("q", q);

  // Fire the page query AND a no-search count query in parallel — the
  // latter feeds the "X imagens no total" stat (always the full
  // library count, ignores the search filter).
  const [res, totalRes] = await Promise.all([
    apiFetch(`/admin/media?${listParams.toString()}`),
    apiFetch("/admin/media?pageSize=1"),
  ]);
  const body = res.ok
    ? ((await res.json()) as PageResult<MediaApi>)
    : { items: [], total: 0, page: 1, pageSize: PAGE_SIZE };
  const totalLibrary = totalRes.ok
    ? ((await totalRes.json()) as PageResult<MediaApi>).total
    : body.total;
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
      />
    </AdminShell>
  );
}
