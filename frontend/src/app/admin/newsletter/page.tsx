import { AdminShell } from "../AdminShell";
import AdminNewsletterClient, {
  type Subscriber,
} from "./AdminNewsletterClient";
import { apiFetch } from "@/lib/api";

interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface SubscriberApi {
  id: string;
  email: string;
  name: string;
  status: "ATIVO" | "INATIVO" | "CANCELADO";
  segment: string;
  opens: number;
  joinedAt: string;
}

interface StatsApi {
  total: number;
  ativo: number;
  inativo: number;
  cancelado: number;
}

const SUB_STATUS_API_TO_UI: Record<
  SubscriberApi["status"],
  Subscriber["status"]
> = {
  ATIVO: "ativo",
  INATIVO: "inativo",
  CANCELADO: "cancelado",
};

const dateFmt = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

function toSubscriber(s: SubscriberApi): Subscriber {
  return {
    id: s.id,
    email: s.email,
    name: s.name,
    joinedAt: dateFmt.format(new Date(s.joinedAt)),
    status: SUB_STATUS_API_TO_UI[s.status],
    segment: s.segment,
  };
}

const PAGE_SIZE = 20;

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

  // Stats are independent of the search / page so the headline
  // totals don't shrink when the user filters the visible list.
  const [subRes, statsRes] = await Promise.all([
    apiFetch(`/admin/newsletters/subscribers?${listParams.toString()}`),
    apiFetch("/admin/newsletters/subscribers/stats"),
  ]);
  if (subRes.status === 403) {
    return (
      <AdminShell active="/admin/newsletter">
        <main className="bg-[#f6f7fb] p-8">
          <h1 className="text-xl font-bold text-red-600">Sem acesso</h1>
          <p className="mt-2 text-sm text-gray-500">
            O seu papel não tem a permissão <code>newsletter.listas</code>.
          </p>
        </main>
      </AdminShell>
    );
  }
  const body = subRes.ok
    ? ((await subRes.json()) as PageResult<SubscriberApi>)
    : { items: [], total: 0, page: 1, pageSize: PAGE_SIZE };
  const stats: StatsApi = statsRes.ok
    ? ((await statsRes.json()) as StatsApi)
    : { total: 0, ativo: 0, inativo: 0, cancelado: 0 };
  const subscribers = body.items.map(toSubscriber);
  const totalPages = Math.max(1, Math.ceil(body.total / PAGE_SIZE));

  return (
    <AdminShell active="/admin/newsletter">
      <AdminNewsletterClient
        initialSubscribers={subscribers}
        totalSubscribers={body.total}
        statsTotal={stats.total}
        statsAtivo={stats.ativo}
        statsCancelado={stats.cancelado}
        currentPage={page}
        totalPages={totalPages}
        searchQuery={q}
      />
    </AdminShell>
  );
}
