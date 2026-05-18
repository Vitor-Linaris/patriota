"use client";

import { useState, type ReactNode } from "react";

type TabId =
  | "geral"
  | "email"
  | "seo"
  | "redes"
  | "newsletter"
  | "seguranca";

const tabs: { id: TabId; label: string; icon: string }[] = [
  { id: "geral", label: "Geral", icon: "⊙" },
  { id: "email", label: "E-mail", icon: "◈" },
  { id: "seo", label: "SEO", icon: "◉" },
  { id: "redes", label: "Redes Sociais", icon: "◎" },
  { id: "newsletter", label: "Newsletter", icon: "◇" },
  { id: "seguranca", label: "Segurança", icon: "◆" },
];

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
      className={`relative h-[22px] w-10 shrink-0 rounded-full transition-colors ${checked ? "bg-[#0F2C6B]" : "bg-gray-200"}`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200 ${checked ? "translate-x-5" : "translate-x-0.5"}`}
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
}: {
  onSave: () => void;
  saved: boolean;
}) {
  return (
    <div className="mt-2 flex items-center justify-end gap-3 border-t border-gray-100 pt-4">
      {saved && (
        <span className="text-sm font-semibold text-green-600">✓ Guardado</span>
      )}
      <button
        type="button"
        onClick={onSave}
        className="rounded-lg bg-[#0F2C6B] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#1A3A7A]"
      >
        Guardar alterações
      </button>
    </div>
  );
}

export default function AdminSettingsClient() {
  const [tab, setTab] = useState<TabId>("geral");
  const [saved, setSaved] = useState<TabId | null>(null);

  const [siteName, setSiteName] = useState("O Patriota Notícias");
  const [tagline, setTagline] = useState("Jornalismo independente que faz a diferença.");
  const [siteUrl, setSiteUrl] = useState("https://www.opatriota.pt");
  const [timezone, setTimezone] = useState("Europe/Lisbon");
  const [language, setLanguage] = useState("pt-PT");
  const [breakingNews, setBreakingNews] = useState(true);
  const [maintenanceMode, setMaintenanceMode] = useState(false);

  const [smtpHost, setSmtpHost] = useState("smtp.sendgrid.net");
  const [smtpPort, setSmtpPort] = useState("587");
  const [smtpUser, setSmtpUser] = useState("apikey");
  const [smtpPass, setSmtpPass] = useState("••••••••••••••••");
  const [fromName, setFromName] = useState("O Patriota Notícias");
  const [fromEmail, setFromEmail] = useState("noreply@opatriota.pt");
  const [emailComments, setEmailComments] = useState(true);
  const [emailSubscriptions, setEmailSubscriptions] = useState(true);
  const [emailArticlePublished, setEmailArticlePublished] = useState(false);

  const [metaTitle, setMetaTitle] = useState("O Patriota Notícias — Jornalismo independente");
  const [metaDesc, setMetaDesc] = useState("Cobertura completa da actualidade portuguesa. Política, economia, investigação e sociedade.");
  const [ogImage, setOgImage] = useState("https://www.opatriota.pt/og-default.jpg");
  const [canonicalUrl, setCanonicalUrl] = useState("https://www.opatriota.pt");
  const [indexing, setIndexing] = useState(true);
  const [sitemap, setSitemap] = useState(true);
  const [googleAnalytics, setGoogleAnalytics] = useState("G-XXXXXXXXXX");

  const [twitter, setTwitter] = useState("@opatriota");
  const [facebook, setFacebook] = useState("https://facebook.com/opatriota");
  const [instagram, setInstagram] = useState("@opatriota_pt");
  const [linkedin, setLinkedin] = useState("https://linkedin.com/company/opatriota");
  const [youtube, setYoutube] = useState("https://youtube.com/@opatriota");
  const [shareButtons, setShareButtons] = useState(true);
  const [twitterCards, setTwitterCards] = useState(true);

  const [provider, setProvider] = useState("brevo");
  const [listId, setListId] = useState("12");
  const [apiKey, setApiKey] = useState("xkeysib-••••••••••••••••••••••••");
  const [welcomeEmail, setWelcomeEmail] = useState(true);
  const [doubleOptin, setDoubleOptin] = useState(true);
  const [weeklyDigest, setWeeklyDigest] = useState(true);
  const [digestDay, setDigestDay] = useState("segunda");

  const [twoFactor, setTwoFactor] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState("480");
  const [maxLoginAttempts, setMaxLoginAttempts] = useState("5");
  const [ipWhitelist, setIpWhitelist] = useState("");
  const [auditLog, setAuditLog] = useState(true);
  const [recaptcha, setRecaptcha] = useState(true);
  const [recaptchaKey, setRecaptchaKey] = useState("6LeXXXXXXXXXXXXXXXXXX");

  const handleSave = () => {
    setSaved(tab);
    setTimeout(() => setSaved(null), 2500);
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
              <SaveBar onSave={handleSave} saved={saved === "geral"} />
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
              <div className="mb-5 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4">
                <span className="text-lg text-blue-500">ℹ</span>
                <p className="text-xs text-blue-700">
                  As credenciais SMTP são encriptadas. Guarde em variáveis de
                  ambiente para produção.
                </p>
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
              <SaveBar onSave={handleSave} saved={saved === "email"} />
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
              <SaveBar onSave={handleSave} saved={saved === "seo"} />
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
              {[
                { label: "Twitter / X", value: twitter, set: setTwitter, placeholder: "@handle" },
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
              <SaveBar onSave={handleSave} saved={saved === "redes"} />
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
              <SaveBar onSave={handleSave} saved={saved === "newsletter"} />
            </div>
          )}

          {tab === "seguranca" && (
            <div>
              <h2 className="mb-1 text-lg font-black text-[#0F2C6B]">Segurança</h2>
              <p className="mb-5 text-xs text-gray-400">
                Protecção de contas e controlo de acesso.
              </p>
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
              <SaveBar onSave={handleSave} saved={saved === "seguranca"} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
