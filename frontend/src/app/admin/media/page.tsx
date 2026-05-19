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

export default async function Page() {
  const res = await apiFetch("/admin/media?pageSize=100");
  const items = res.ok
    ? ((await res.json()) as PageResult<MediaApi>).items.map(toMediaItem)
    : [];
  return (
    <AdminShell active="/admin/media">
      <AdminMediaClient initialItems={items} />
    </AdminShell>
  );
}
