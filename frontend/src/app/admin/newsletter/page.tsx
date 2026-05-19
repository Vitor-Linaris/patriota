import { AdminShell } from "../AdminShell";
import AdminNewsletterClient, {
  type Campaign,
  type Subscriber,
} from "./AdminNewsletterClient";
import { apiFetch } from "@/lib/api";

interface PageResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

interface CampaignApi {
  id: string;
  subject: string;
  preview: string;
  segment: string;
  header: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
  footer: string;
  status: "RASCUNHO" | "AGENDADA" | "ENVIADA";
  scheduledAt: string | null;
  sentAt: string | null;
  recipients: number;
  opens: number;
  clicks: number;
  openRate: number;
  clickRate: number;
  createdAt: string;
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

const STATUS_API_TO_UI: Record<
  CampaignApi["status"],
  Campaign["status"]
> = {
  RASCUNHO: "rascunho",
  AGENDADA: "agendada",
  ENVIADA: "enviada",
};

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
  month: "short",
  year: "numeric",
});

const monthFmt = new Intl.DateTimeFormat("pt-PT", {
  month: "short",
  year: "numeric",
});

function toCampaign(c: CampaignApi): Campaign {
  let dateStr = "—";
  const sourceDate = c.sentAt ?? c.scheduledAt ?? null;
  if (sourceDate) {
    try {
      dateStr = dateFmt.format(new Date(sourceDate));
    } catch {
      /* keep — */
    }
  }
  return {
    id: c.id,
    subject: c.subject,
    preview: c.preview,
    segment: c.segment,
    header: c.header,
    body: c.body,
    ctaText: c.ctaText,
    ctaUrl: c.ctaUrl,
    footer: c.footer,
    status: STATUS_API_TO_UI[c.status],
    date: dateStr,
    scheduledAt: c.scheduledAt,
    sentAt: c.sentAt,
    opens: c.opens,
    clicks: c.clicks,
    recipients: c.recipients,
    openRate: c.openRate,
    clickRate: c.clickRate,
  };
}

function toSubscriber(s: SubscriberApi): Subscriber {
  return {
    id: s.id,
    email: s.email,
    name: s.name,
    joinedAt: monthFmt.format(new Date(s.joinedAt)),
    status: SUB_STATUS_API_TO_UI[s.status],
    segment: s.segment,
    opens: s.opens,
  };
}

export default async function Page() {
  const [campRes, subRes] = await Promise.all([
    apiFetch("/admin/newsletters/campaigns?pageSize=50"),
    apiFetch("/admin/newsletters/subscribers?pageSize=200"),
  ]);
  const campaigns = campRes.ok
    ? ((await campRes.json()) as PageResult<CampaignApi>).items.map(
        toCampaign,
      )
    : [];
  const subscribers = subRes.ok
    ? ((await subRes.json()) as PageResult<SubscriberApi>).items.map(
        toSubscriber,
      )
    : [];

  return (
    <AdminShell active="/admin/newsletter">
      <AdminNewsletterClient
        initialCampaigns={campaigns}
        initialSubscribers={subscribers}
      />
    </AdminShell>
  );
}
