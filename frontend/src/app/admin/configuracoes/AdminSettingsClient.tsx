"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { saveSettingsSectionAction, type SettingsSection } from "./actions";

type TabId = SettingsSection;

export interface GeralSettings {
  siteName: string;
  tagline: string;
  siteUrl: string;
  timezone: string;
  language: string;
  breakingNews: boolean;
  maintenanceMode: boolean;
}

export interface EmailSettings {
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  fromName: string;
  fromEmail: string;
  emailComments: boolean;
  emailSubscriptions: boolean;
  emailArticlePublished: boolean;
}

export interface SeoSettings {
  metaTitle: string;
  metaDescription: string;
  ogImage: string;
  canonicalUrl: string;
  googleAnalytics: string;
  indexing: boolean;
  sitemap: boolean;
}

export interface RedesSettings {
  twitter: string;
  facebook: string;
  instagram: string;
  linkedin: string;
  youtube: string;
  shareButtons: boolean;
  twitterCards: boolean;
}

export interface NewsletterSettings {
  provider: string;
  listId: string;
  welcomeEmail: boolean;
  doubleOptin: boolean;
  weeklyDigest: boolean;
  digestDay: string;
}

export interface SegurancaSettings {
  twoFactor: boolean;
  sessionTimeout: string;
  maxLoginAttempts: string;
  ipWhitelist: string;
  auditLog: boolean;
  recaptcha: boolean;
  recaptchaKey: string;
}

export interface SettingsBundle {
  geral: GeralSettings;
  email: EmailSettings;
  seo: SeoSettings;
  redes: RedesSettings;
  newsletter: NewsletterSettings;
  seguranca: SegurancaSettings;
}

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: "geral", label: "Geral", icon: "⊙" },
  { id: "email", label: "E-mail", icon: "◈" },
  { id: "seo", label: "SEO", icon: "◉" },
  { id: "redes", label: "Redes Sociais", icon: "◎" },
  // Newsletter tab hidden — /admin/newsletter is now just a
  // subscriber list with CSV/XLSX export. The fields here (provider,
  // listId, welcome email, double opt-in, weekly digest) assumed a
  // full campaign engine that we removed. Panel + state kept below
  // as dead code so it can be reinstated in one line if we ever
  // bring native campaigns back.
  // { id: "newsletter", label: "Newsletter", icon: "◇" },
  { id: "seguranca", label: "Segurança", icon: "◆" },
];

/**
 * Local Toggle — same flex-items-center pattern as the shared
 * `@/components/admin/Toggle` (which uses `onChange: (next) => void`).
 * Kept inline here because every call site in this file uses the
 * `() => set(prev => !prev)` shape and converting them all would
 * just add noise. Visually + behaviourally identical to the shared
 * one: thumb is vertically centred via inline-flex instead of the
 * old absolute-position hack that let the circle drift outside the
 * track on the publicity page (and here too).
 */
function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      aria-pressed={checked}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full px-0.5 transition-colors ${checked ? "bg-[#0F2C6B]" : "bg-gray-300"}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? "translate-x-4" : "translate-x-0"}`}
      />
    </button>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-6 border-b border-gray-50 py-5 last:border-0">
      <div className="w-56 shrink-0">
        <p className="text-sm font-semibold text-gray-800">{label}</p>
        {hint && (
          <p className="mt-0.5 text-xs leading-relaxed text-gray-400">{hint}</p>
        )}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  mono = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm transition-all focus:border-[#0F2C6B] focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/10 ${mono ? "font-mono" : ""}`}
    />
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-none rounded-lg border border-gray-200 px-4 py-2.5 text-sm transition-all focus:border-[#0F2C6B] focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/10"
    />
  );
}

function SaveBar({
  onSave,
  saved,
  pending,
  error,
}: {
  onSave: () => void;
  saved: boolean;
  pending: boolean;
  error: string | null;
}) {
  return (
    <div className="mt-2 flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
      {error && (
        <span className="text-sm font-semibold text-red-600">{error}</span>
      )}
      {!error && saved && (
        <span className="text-sm font-semibold text-green-600">✓ Guardado</span>
      )}
      <button
        type="button"
        onClick={onSave}
        disabled={pending}
        className="rounded-lg bg-[#0F2C6B] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#1A3A7A] disabled:opacity-50"
      >
        {pending ? "A guardar…" : "Guardar alterações"}
      </button>
    </div>
  );
}

export default function AdminSettingsClient({
  initial,
}: {
  initial: SettingsBundle;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<TabId>("geral");
  const [saved, setSaved] = useState<TabId | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ── Geral ──
  const [siteName, setSiteName] = useState(initial.geral.siteName);
  const [tagline, setTagline] = useState(initial.geral.tagline);
  const [siteUrl, setSiteUrl] = useState(initial.geral.siteUrl);
  const [timezone, setTimezone] = useState(initial.geral.timezone);
  const [language, setLanguage] = useState(initial.geral.language);
  const [breakingNews, setBreakingNews] = useState(initial.geral.breakingNews);
  const [maintenanceMode, setMaintenanceMode] = useState(
    initial.geral.maintenanceMode,
  );

  // ── Email ──
  const [smtpHost, setSmtpHost] = useState(initial.email.smtpHost);
  const [smtpPort, setSmtpPort] = useState(initial.email.smtpPort);
  const [smtpUser, setSmtpUser] = useState(initial.email.smtpUser);
  // SMTP password is never sent from the server. Keep it local & opaque.
  const [smtpPass, setSmtpPass] = useState("");
  const [fromName, setFromName] = useState(initial.email.fromName);
  const [fromEmail, setFromEmail] = useState(initial.email.fromEmail);
  const [emailComments, setEmailComments] = useState(
    initial.email.emailComments,
  );
  const [emailSubscriptions, setEmailSubscriptions] = useState(
    initial.email.emailSubscriptions,
  );
  const [emailArticlePublished, setEmailArticlePublished] = useState(
    initial.email.emailArticlePublished,
  );

  // ── SEO ──
  const [metaTitle, setMetaTitle] = useState(initial.seo.metaTitle);
  const [metaDesc, setMetaDesc] = useState(initial.seo.metaDescription);
  const [ogImage, setOgImage] = useState(initial.seo.ogImage);
  const [canonicalUrl, setCanonicalUrl] = useState(initial.seo.canonicalUrl);
  const [indexing, setIndexing] = useState(initial.seo.indexing);
  const [sitemap, setSitemap] = useState(initial.seo.sitemap);
  const [googleAnalytics, setGoogleAnalytics] = useState(
    initial.seo.googleAnalytics,
  );

  // ── Redes ──
  const [twitter, setTwitter] = useState(initial.redes.twitter);
  const [facebook, setFacebook] = useState(initial.redes.facebook);
  const [instagram, setInstagram] = useState(initial.redes.instagram);
  const [linkedin, setLinkedin] = useState(initial.redes.linkedin);
  const [youtube, setYoutube] = useState(initial.redes.youtube);
  const [shareButtons, setShareButtons] = useState(initial.redes.shareButtons);
  const [twitterCards, setTwitterCards] = useState(initial.redes.twitterCards);

  // ── Newsletter ──
  const [provider, setProvider] = useState(initial.newsletter.provider);
  const [listId, setListId] = useState(initial.newsletter.listId);
  const [apiKey, setApiKey] = useState("");
  const [welcomeEmail, setWelcomeEmail] = useState(
    initial.newsletter.welcomeEmail,
  );
  const [doubleOptin, setDoubleOptin] = useState(
    initial.newsletter.doubleOptin,
  );
  const [weeklyDigest, setWeeklyDigest] = useState(
    initial.newsletter.weeklyDigest,
  );
  const [digestDay, setDigestDay] = useState(initial.newsletter.digestDay);

  // ── Segurança ──
  const [twoFactor, setTwoFactor] = useState(initial.seguranca.twoFactor);
  const [sessionTimeout, setSessionTimeout] = useState(
    initial.seguranca.sessionTimeout,
  );
  const [maxLoginAttempts, setMaxLoginAttempts] = useState(
    initial.seguranca.maxLoginAttempts,
  );
  const [ipWhitelist, setIpWhitelist] = useState(initial.seguranca.ipWhitelist);
  const [auditLog, setAuditLog] = useState(initial.seguranca.auditLog);
  const [recaptcha, setRecaptcha] = useState(initial.seguranca.recaptcha);
  const [recaptchaKey, setRecaptchaKey] = useState(
    initial.seguranca.recaptchaKey,
  );

  const collectCurrent = (): Record<string, unknown> => {
    switch (tab) {
      case "geral":
        return {
          siteName,
          tagline,
          siteUrl,
          timezone,
          language,
          breakingNews,
          maintenanceMode,
        };
      case "email":
        return {
          smtpHost,
          smtpPort,
          smtpUser,
          fromName,
          fromEmail,
          emailComments,
          emailSubscriptions,
          emailArticlePublished,
        };
      case "seo":
        return {
          metaTitle,
          metaDescription: metaDesc,
          ogImage,
          canonicalUrl,
          googleAnalytics,
          indexing,
          sitemap,
        };
      case "redes":
        return {
          twitter,
          facebook,
          instagram,
          linkedin,
          youtube,
          shareButtons,
          twitterCards,
        };
      case "newsletter":
        return {
          provider,
          listId,
          welcomeEmail,
          doubleOptin,
          weeklyDigest,
          digestDay,
        };
      case "seguranca":
        return {
          twoFactor,
          sessionTimeout,
          maxLoginAttempts,
          ipWhitelist,
          auditLog,
          recaptcha,
          recaptchaKey,
        };
    }
  };

  const handleSave = () => {
    setSaveError(null);
    const data = collectCurrent();
    const section = tab;
    startTransition(async () => {
      const res = await saveSettingsSectionAction(section, data);
      if (!res.ok) {
        setSaveError(res.error);
        return;
      }
      setSaved(section);
      setTimeout(() => setSaved(null), 2500);
      router.refresh();
    });
  };

  return (
    <main className="bg-[#f6f7fb] p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-black text-[#0F2C6B]">Configurações</h1>
        <p className="mt-1 text-sm text-gray-500">
          Definições globais do sistema editorial.
        </p>
      </div>

      <div className="flex gap-6">
        {/* SIDEBAR TABS */}
        <div className="w-44 shrink-0">
          <nav className="space-y-0.5">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2.5 text-left text-sm transition-all ${tab === t.id ? "bg-[#0F2C6B] font-bold text-white" : "font-medium text-gray-600 hover:bg-gray-100"}`}
              >
                <span className="text-base">{t.icon}</span>
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* CONTENT */}
        <div className="flex-1 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          {tab === "geral" && (
            <div>
              <h2 className="mb-1 text-lg font-black text-[#0F2C6B]">
                Configurações Gerais
              </h2>
              <p className="mb-5 text-xs text-gray-400">
                Identidade e comportamento global do site.
              </p>
              <Field label="Nome do site" hint="Aparece no título das páginas e metadados.">
                <Input value={siteName} onChange={setSiteName} />
              </Field>
              <Field label="Tagline" hint="Frase curta de posicionamento editorial.">
                <Input value={tagline} onChange={setTagline} />
              </Field>
              <Field label="URL do site" hint="URL canónico de produção.">
                <Input value={siteUrl} onChange={setSiteUrl} mono placeholder="https://" />
              </Field>
              <Field
                label="Fuso horário"
                hint="Usado em publicações agendadas e metadados."
              >
                <select
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                >
                  <option value="Europe/Lisbon">Europe/Lisbon (WET/WEST)</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Europe/Madrid">Europe/Madrid</option>
                  <option value="America/Sao_Paulo">America/São_Paulo</option>
                </select>
              </Field>
              <Field label="Idioma" hint="Idioma padrão do conteúdo.">
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                >
                  <option value="pt-PT">Português (Portugal)</option>
                  <option value="pt-BR">Português (Brasil)</option>
                  <option value="en">English</option>
                </select>
              </Field>
              <Field
                label="Ticker de última hora"
                hint="Faixa de notícias urgentes no topo da homepage."
              >
                <div className="flex items-center gap-3">
                  <Toggle
                    checked={breakingNews}
                    onChange={() => setBreakingNews((v) => !v)}
                  />
                  <span className="text-sm text-gray-600">
                    {breakingNews ? "Activo" : "Inactivo"}
                  </span>
                </div>
              </Field>
              <Field
                label="Modo de manutenção"
                hint="Bloqueia o acesso ao site para leitores. Admin mantém acesso."
              >
                <div className="flex items-center gap-3">
                  <Toggle
                    checked={maintenanceMode}
                    onChange={() => setMaintenanceMode((v) => !v)}
                  />
                  <span
                    className={`text-sm font-semibold ${maintenanceMode ? "text-red-600" : "text-gray-500"}`}
                  >
                    {maintenanceMode ? "⚠ Site em manutenção" : "Site activo"}
                  </span>
                </div>
              </Field>
              <SaveBar
                onSave={handleSave}
                saved={saved === "geral"}
                pending={pending && tab === "geral"}
                error={tab === "geral" ? saveError : null}
              />
            </div>
          )}

          {tab === "email" && (
            <div>
              <h2 className="mb-1 text-lg font-black text-[#0F2C6B]">
                Configurações de E-mail
              </h2>
              <p className="mb-5 text-xs text-gray-400">
                SMTP para envio de notificações e newsletters.
              </p>
              <div className="mb-5 flex items-start gap-3 rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4">
                <span className="text-lg text-amber-500">⚠</span>
                <div className="text-sm text-amber-900">
                  <p className="mb-1 font-bold uppercase tracking-wider text-amber-700">
                    Funcionalidade futura
                  </p>
                  <p className="leading-relaxed">
                    O envio de e-mails via SMTP <strong>ainda não está
                    activo</strong>. Os campos abaixo são guardados na base
                    de dados para futura integração, mas o sistema não envia
                    nenhum e-mail no momento (convites, notificações,
                    newsletters). Esta funcionalidade será implementada numa
                    fase posterior.
                  </p>
                </div>
              </div>
              <Field label="Servidor SMTP" hint="Hostname do servidor de envio.">
                <Input value={smtpHost} onChange={setSmtpHost} mono placeholder="smtp.exemplo.com" />
              </Field>
              <Field label="Porta SMTP">
                <div className="flex gap-2">
                  {["25", "465", "587", "2525"].map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setSmtpPort(p)}
                      className={`rounded-lg border px-4 py-2 text-sm font-bold transition-all ${smtpPort === p ? "border-[#0F2C6B] bg-[#0F2C6B] text-white" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}
                    >
                      {p}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Utilizador SMTP">
                <Input value={smtpUser} onChange={setSmtpUser} mono />
              </Field>
              <Field label="Palavra-passe SMTP">
                <Input value={smtpPass} onChange={setSmtpPass} mono />
              </Field>
              <Field label="Nome do remetente" hint="Aparece no campo 'De:' dos e-mails.">
                <Input value={fromName} onChange={setFromName} />
              </Field>
              <Field label="E-mail remetente">
                <Input value={fromEmail} onChange={setFromEmail} mono placeholder="noreply@seusite.pt" />
              </Field>
              <div className="mt-2 border-t border-gray-50 pt-4">
                <p className="mb-3 text-sm font-bold text-gray-700">
                  Notificações por e-mail
                </p>
                {[
                  { label: "Novos comentários", val: emailComments, set: setEmailComments },
                  { label: "Novas subscrições", val: emailSubscriptions, set: setEmailSubscriptions },
                  { label: "Artigo publicado (autores)", val: emailArticlePublished, set: setEmailArticlePublished },
                ].map((n) => (
                  <div
                    key={n.label}
                    className="flex items-center justify-between border-b border-gray-50 py-2.5 last:border-0"
                  >
                    <span className="text-sm text-gray-600">{n.label}</span>
                    <Toggle checked={n.val} onChange={() => n.set((v) => !v)} />
                  </div>
                ))}
              </div>
              <SaveBar
                onSave={handleSave}
                saved={saved === "email"}
                pending={pending && tab === "email"}
                error={tab === "email" ? saveError : null}
              />
            </div>
          )}

          {tab === "seo" && (
            <div>
              <h2 className="mb-1 text-lg font-black text-[#0F2C6B]">
                SEO & Metadados
              </h2>
              <p className="mb-5 text-xs text-gray-400">
                Controlo de indexação e metadados globais do site.
              </p>
              <Field
                label="Meta título"
                hint="Título padrão para partilha e motores de busca. Máximo 60 caracteres."
              >
                <Input value={metaTitle} onChange={setMetaTitle} />
                <p
                  className={`mt-1 text-[10px] ${metaTitle.length > 60 ? "text-red-500" : "text-gray-400"}`}
                >
                  {metaTitle.length}/60 caracteres
                </p>
              </Field>
              <Field
                label="Meta descrição"
                hint="Descrição exibida nos resultados de pesquisa. Máximo 160 caracteres."
              >
                <Textarea value={metaDesc} onChange={setMetaDesc} rows={2} />
                <p
                  className={`mt-1 text-[10px] ${metaDesc.length > 160 ? "text-red-500" : "text-gray-400"}`}
                >
                  {metaDesc.length}/160 caracteres
                </p>
              </Field>
              <Field
                label="Imagem OG padrão"
                hint="Imagem exibida ao partilhar nas redes sociais (1200×630px)."
              >
                <Input value={ogImage} onChange={setOgImage} mono placeholder="https://..." />
              </Field>
              <Field label="URL canónico" hint="URL principal para evitar conteúdo duplicado.">
                <Input value={canonicalUrl} onChange={setCanonicalUrl} mono />
              </Field>
              <Field label="Google Analytics" hint="ID de medição (G-XXXXXXXXXX).">
                <Input value={googleAnalytics} onChange={setGoogleAnalytics} mono placeholder="G-XXXXXXXXXX" />
              </Field>
              <Field
                label="Indexação por motores de busca"
                hint="Desactivar impede o Google de indexar o site."
              >
                <div className="flex items-center gap-3">
                  <Toggle checked={indexing} onChange={() => setIndexing((v) => !v)} />
                  <span
                    className={`text-sm font-semibold ${indexing ? "text-green-600" : "text-red-600"}`}
                  >
                    {indexing ? "Indexação activa" : "Noindex activado"}
                  </span>
                </div>
              </Field>
              <Field
                label="Sitemap automático"
                hint="Gera e actualiza o sitemap.xml automaticamente."
              >
                <div className="flex items-center gap-3">
                  <Toggle checked={sitemap} onChange={() => setSitemap((v) => !v)} />
                  {sitemap && (
                    <a
                      href="#"
                      className="text-xs font-semibold text-[#0F2C6B] hover:underline"
                    >
                      /sitemap.xml →
                    </a>
                  )}
                </div>
              </Field>
              <SaveBar
                onSave={handleSave}
                saved={saved === "seo"}
                pending={pending && tab === "seo"}
                error={tab === "seo" ? saveError : null}
              />
            </div>
          )}

          {tab === "redes" && (
            <div>
              <h2 className="mb-1 text-lg font-black text-[#0F2C6B]">
                Redes Sociais
              </h2>
              <p className="mb-5 text-xs text-gray-400">
                Perfis e integrações com redes sociais.
              </p>
              <div className="mb-5 flex items-start gap-3 rounded-xl border-l-4 border-green-400 bg-green-50 p-4">
                <span className="text-lg text-green-500">✓</span>
                <p className="text-sm leading-relaxed text-green-900">
                  Os links preenchidos abaixo aparecem como ícones no{" "}
                  <strong>rodapé público</strong> (por baixo do logo).
                  Deixe vazio o que não quiser mostrar.
                </p>
              </div>
              {[
                { label: "Twitter / X", value: twitter, set: setTwitter, placeholder: "https://twitter.com/opatriota" },
                { label: "Facebook", value: facebook, set: setFacebook, placeholder: "https://facebook.com/..." },
                { label: "Instagram", value: instagram, set: setInstagram, placeholder: "@handle" },
                { label: "LinkedIn", value: linkedin, set: setLinkedin, placeholder: "https://linkedin.com/company/..." },
                { label: "YouTube", value: youtube, set: setYoutube, placeholder: "https://youtube.com/@..." },
              ].map((s) => (
                <Field key={s.label} label={s.label}>
                  <Input value={s.value} onChange={s.set} placeholder={s.placeholder} mono />
                </Field>
              ))}
              <Field
                label="Botões de partilha"
                hint="Mostra botões de partilha no final de cada artigo."
              >
                <div className="flex items-center gap-3">
                  <Toggle checked={shareButtons} onChange={() => setShareButtons((v) => !v)} />
                  <span className="text-sm text-gray-600">
                    {shareButtons ? "Visíveis" : "Ocultos"}
                  </span>
                </div>
              </Field>
              <Field
                label="Twitter Cards"
                hint="Metadados especiais para pré-visualização no Twitter/X."
              >
                <div className="flex items-center gap-3">
                  <Toggle checked={twitterCards} onChange={() => setTwitterCards((v) => !v)} />
                  <span className="text-sm text-gray-600">
                    {twitterCards ? "Activados" : "Desactivados"}
                  </span>
                </div>
              </Field>
              <SaveBar
                onSave={handleSave}
                saved={saved === "redes"}
                pending={pending && tab === "redes"}
                error={tab === "redes" ? saveError : null}
              />
            </div>
          )}

          {tab === "newsletter" && (
            <div>
              <h2 className="mb-1 text-lg font-black text-[#0F2C6B]">Newsletter</h2>
              <p className="mb-5 text-xs text-gray-400">
                Integração com plataforma de envio de newsletters.
              </p>
              <Field label="Fornecedor" hint="Plataforma de email marketing.">
                <div className="flex gap-2">
                  {["brevo", "mailchimp", "mailerlite", "convertkit"].map(
                    (p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setProvider(p)}
                        className={`rounded-lg border px-4 py-2 text-sm font-bold capitalize transition-all ${provider === p ? "border-[#0F2C6B] bg-[#0F2C6B] text-white" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}
                      >
                        {p}
                      </button>
                    ),
                  )}
                </div>
              </Field>
              <Field label="API Key" hint="Chave de API do fornecedor.">
                <Input value={apiKey} onChange={setApiKey} mono />
              </Field>
              <Field
                label="ID da lista"
                hint="Identificador da lista principal de subscritores."
              >
                <Input value={listId} onChange={setListId} mono placeholder="12" />
              </Field>
              <Field
                label="E-mail de boas-vindas"
                hint="Enviado automaticamente após subscrição."
              >
                <div className="flex items-center gap-3">
                  <Toggle checked={welcomeEmail} onChange={() => setWelcomeEmail((v) => !v)} />
                  <span className="text-sm text-gray-600">
                    {welcomeEmail ? "Activo" : "Desactivado"}
                  </span>
                </div>
              </Field>
              <Field
                label="Double opt-in"
                hint="Requer confirmação por e-mail antes de activar a subscrição."
              >
                <div className="flex items-center gap-3">
                  <Toggle checked={doubleOptin} onChange={() => setDoubleOptin((v) => !v)} />
                  <span className="text-sm text-gray-600">
                    {doubleOptin ? "Activo (recomendado)" : "Desactivado"}
                  </span>
                </div>
              </Field>
              <Field
                label="Digest semanal"
                hint="Envio automático com os melhores artigos da semana."
              >
                <div className="flex items-center gap-3">
                  <Toggle checked={weeklyDigest} onChange={() => setWeeklyDigest((v) => !v)} />
                  {weeklyDigest && (
                    <select
                      value={digestDay}
                      onChange={(e) => setDigestDay(e.target.value)}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                    >
                      {["segunda", "terça", "quarta", "quinta", "sexta", "sábado", "domingo"].map(
                        (d) => (
                          <option key={d} value={d}>
                            {d.charAt(0).toUpperCase() + d.slice(1)}-feira
                          </option>
                        ),
                      )}
                    </select>
                  )}
                </div>
              </Field>
              <SaveBar
                onSave={handleSave}
                saved={saved === "newsletter"}
                pending={pending && tab === "newsletter"}
                error={tab === "newsletter" ? saveError : null}
              />
            </div>
          )}

          {tab === "seguranca" && (
            <div>
              <h2 className="mb-1 text-lg font-black text-[#0F2C6B]">Segurança</h2>
              <p className="mb-5 text-xs text-gray-400">
                Protecção de contas e controlo de acesso.
              </p>
              <div className="mb-5 flex items-start gap-3 rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4">
                <span className="text-lg text-amber-500">⚠</span>
                <div className="text-sm text-amber-900">
                  <p className="mb-1 font-bold uppercase tracking-wider text-amber-700">
                    Estado das defesas
                  </p>
                  <ul className="space-y-0.5 text-xs leading-relaxed">
                    <li>
                      <strong>Activos</strong>: log de auditoria (todas as
                      acções administrativas são registadas) e limite de
                      pedidos no login (rate limit global).
                    </li>
                    <li>
                      <strong>Em desenvolvimento</strong>: 2FA, timeout de
                      sessão configurável, whitelist de IPs e reCAPTCHA — os
                      valores são guardados mas ainda não são aplicados.
                    </li>
                  </ul>
                </div>
              </div>
              <Field
                label="Autenticação em dois factores"
                hint="Obriga todos os administradores a usar 2FA."
              >
                <div className="flex items-center gap-3">
                  <Toggle checked={twoFactor} onChange={() => setTwoFactor((v) => !v)} />
                  <span
                    className={`text-sm font-semibold ${twoFactor ? "text-green-600" : "text-amber-600"}`}
                  >
                    {twoFactor ? "Obrigatório para todos" : "Opcional"}
                  </span>
                </div>
              </Field>
              <Field
                label="Timeout de sessão (min)"
                hint="Minutos de inactividade até encerrar a sessão automaticamente."
              >
                <div className="flex gap-2">
                  {["30", "60", "120", "480"].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setSessionTimeout(v)}
                      className={`rounded-lg border px-4 py-2 text-sm font-bold transition-all ${sessionTimeout === v ? "border-[#0F2C6B] bg-[#0F2C6B] text-white" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}
                    >
                      {v}m
                    </button>
                  ))}
                </div>
              </Field>
              <Field
                label="Tentativas de login"
                hint="Número máximo de tentativas falhadas antes de bloquear."
              >
                <div className="flex gap-2">
                  {["3", "5", "10"].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMaxLoginAttempts(v)}
                      className={`rounded-lg border px-4 py-2 text-sm font-bold transition-all ${maxLoginAttempts === v ? "border-[#0F2C6B] bg-[#0F2C6B] text-white" : "border-gray-200 text-gray-500 hover:border-gray-400"}`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </Field>
              <Field
                label="Whitelist de IPs"
                hint="IPs autorizados para acesso ao admin (um por linha). Deixar vazio para não restringir."
              >
                <Textarea
                  value={ipWhitelist}
                  onChange={setIpWhitelist}
                  placeholder={"194.xxx.xxx.xxx\n10.0.0.0/24"}
                  rows={3}
                />
              </Field>
              <Field label="Log de auditoria" hint="Regista todas as acções dos administradores.">
                <div className="flex items-center gap-3">
                  <Toggle checked={auditLog} onChange={() => setAuditLog((v) => !v)} />
                  <span className="text-sm text-gray-600">
                    {auditLog ? "Activo" : "Desactivado"}
                  </span>
                </div>
              </Field>
              <Field
                label="reCAPTCHA"
                hint="Protecção contra bots nos formulários públicos."
              >
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Toggle checked={recaptcha} onChange={() => setRecaptcha((v) => !v)} />
                    <span className="text-sm text-gray-600">
                      {recaptcha ? "Activo" : "Desactivado"}
                    </span>
                  </div>
                  {recaptcha && (
                    <Input
                      value={recaptchaKey}
                      onChange={setRecaptchaKey}
                      mono
                      placeholder="Chave de site reCAPTCHA v3"
                    />
                  )}
                </div>
              </Field>
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="mb-1 text-sm font-bold text-red-700">
                  Zona de perigo
                </p>
                <p className="mb-3 text-xs text-red-500">
                  Acções irreversíveis. Use com cuidado.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-red-300 px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
                  >
                    Invalidar todas as sessões
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-300 px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
                  >
                    Limpar cache do site
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border border-red-300 px-4 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100"
                  >
                    Exportar log de auditoria
                  </button>
                </div>
              </div>
              <SaveBar
                onSave={handleSave}
                saved={saved === "seguranca"}
                pending={pending && tab === "seguranca"}
                error={tab === "seguranca" ? saveError : null}
              />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
