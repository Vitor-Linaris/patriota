import { AdminShell } from "../AdminShell";
import AdminSettingsClient, {
  type MailerStatus,
  type SettingsBundle,
} from "./AdminSettingsClient";
import { apiFetch } from "@/lib/api";

const DEFAULTS: SettingsBundle = {
  geral: {
    siteName: "O Patriota Notícias",
    tagline: "Jornalismo independente que faz a diferença.",
    siteUrl: "https://www.opatriota.pt",
    timezone: "Europe/Lisbon",
    language: "pt-PT",
    breakingNews: true,
    maintenanceMode: false,
  },
  email: {
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    fromName: "O Patriota Notícias",
    fromEmail: "noreply@opatriota.pt",
    // Espelha o default do backend (settings.service.ts): ligado, para
    // que um site novo não fique a acumular notificações pendentes que
    // nunca saem.
    emailArticlePublished: true,
  },
  seo: {
    metaTitle: "O Patriota Notícias — Jornalismo independente",
    metaDescription:
      "Cobertura completa da actualidade portuguesa. Política, economia, investigação e sociedade.",
    ogImage: "https://www.opatriota.pt/og-default.jpg",
    canonicalUrl: "https://www.opatriota.pt",
    googleAnalytics: "",
    indexing: true,
    sitemap: true,
  },
  redes: {
    twitter: "@opatriota",
    facebook: "https://facebook.com/opatriota",
    instagram: "@opatriota_pt",
    linkedin: "https://linkedin.com/company/opatriota",
    youtube: "https://youtube.com/@opatriota",
    shareButtons: true,
    twitterCards: true,
  },
  newsletter: {
    provider: "brevo",
    listId: "",
    welcomeEmail: true,
    doubleOptin: true,
    weeklyDigest: true,
    digestDay: "segunda",
  },
  seguranca: {
    twoFactor: false,
    sessionTimeout: "480",
    maxLoginAttempts: "5",
    ipWhitelist: "",
    auditLog: true,
    recaptcha: true,
    recaptchaKey: "",
  },
};

function mergeWithDefaults(remote: Partial<SettingsBundle>): SettingsBundle {
  return {
    geral: { ...DEFAULTS.geral, ...(remote.geral ?? {}) },
    email: { ...DEFAULTS.email, ...(remote.email ?? {}) },
    seo: { ...DEFAULTS.seo, ...(remote.seo ?? {}) },
    redes: { ...DEFAULTS.redes, ...(remote.redes ?? {}) },
    newsletter: { ...DEFAULTS.newsletter, ...(remote.newsletter ?? {}) },
    seguranca: { ...DEFAULTS.seguranca, ...(remote.seguranca ?? {}) },
  };
}

export default async function Page() {
  const [res, mailerRes] = await Promise.all([
    apiFetch("/admin/settings"),
    // Which provider is actually sending. Read-only: the provider and
    // its key are environment configuration, never Setting rows — that
    // JSON blob goes to everybody with configuracoes.aceder.
    apiFetch("/admin/settings/mailer"),
  ]);
  const data = res.ok
    ? ((await res.json()) as Partial<SettingsBundle>)
    : {};
  const mailer = mailerRes.ok
    ? ((await mailerRes.json()) as MailerStatus)
    : { driver: "log", configured: true, isLog: true };
  return (
    <AdminShell active="/admin/configuracoes">
      <AdminSettingsClient initial={mergeWithDefaults(data)} mailer={mailer} />
    </AdminShell>
  );
}
