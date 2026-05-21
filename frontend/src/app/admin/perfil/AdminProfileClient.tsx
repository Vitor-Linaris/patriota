"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  changePasswordAction,
  updateProfileAction,
  uploadAvatarAction,
} from "./actions";
import { validateImageUpload } from "@/lib/upload-limits";

interface ProfileData {
  name: string;
  email: string;
  role: string;
  bio: string;
  phone: string;
  avatarUrl: string;
  avatarInitials: string;
}

interface NotificationPrefs {
  newArticle: boolean;
  comments: boolean;
  newsletter: boolean;
  weeklyReport: boolean;
  systemAlerts: boolean;
  loginAlerts: boolean;
}

type Section = "perfil" | "seguranca" | "notificacoes" | "sessoes";

function initials(name: string) {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join("");
}

interface Props {
  initial: ProfileData;
  initialNotifs: NotificationPrefs;
}

export default function AdminProfileClient({ initial, initialNotifs }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [section, setSection] = useState<Section>("perfil");
  const [profile, setProfile] = useState<ProfileData>(initial);
  const [draft, setDraft] = useState<ProfileData>(initial);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");
  const [showPw, setShowPw] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const [notifs, setNotifs] = useState<NotificationPrefs>(initialNotifs);
  const [notifsSaved, setNotifsSaved] = useState(false);
  const [notifsError, setNotifsError] = useState<string | null>(null);

  /**
   * Avatar upload — talks to the dedicated /users/me/avatar endpoint
   * (NOT /admin/media/upload). The backend writes a single WebP @ q80
   * to /uploads/avatars/, updates user.avatarUrl, and does NOT create
   * a Media row — so the photo stays private to this user and never
   * pollutes the shared media library picker.
   */
  function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so picking the same file again still triggers
    if (!file) return;
    const reason = validateImageUpload(file);
    if (reason) {
      setAvatarError(reason);
      return;
    }
    setAvatarError(null);
    setAvatarUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await uploadAvatarAction(fd);
      setAvatarUploading(false);
      if (!res.ok) {
        setAvatarError(res.error);
        return;
      }
      setDraft((d) => ({ ...d, avatarUrl: res.avatarUrl }));
    });
  }

  function saveProfile() {
    setSaveError(null);
    const payload = {
      name: draft.name.trim(),
      bio: draft.bio,
      phone: draft.phone,
      avatarUrl: draft.avatarUrl,
    };
    startTransition(async () => {
      const res = await updateProfileAction(payload);
      if (!res.ok) {
        setSaveError(res.error);
        return;
      }
      const updated = {
        ...draft,
        avatarInitials: initials(draft.name) || draft.email.slice(0, 2).toUpperCase(),
      };
      setProfile(updated);
      setDraft(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
      router.refresh();
    });
  }

  function savePassword() {
    setPwError("");
    if (!pw.current) {
      setPwError("Introduza a palavra-passe atual.");
      return;
    }
    if (pw.next.length < 8) {
      setPwError("A nova palavra-passe deve ter pelo menos 8 caracteres.");
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwError("As palavras-passe não coincidem.");
      return;
    }
    startTransition(async () => {
      const res = await changePasswordAction(pw.current, pw.next);
      if (!res.ok) {
        setPwError(res.error);
        return;
      }
      setPwSaved(true);
      setPw({ current: "", next: "", confirm: "" });
      setTimeout(() => setPwSaved(false), 3000);
    });
  }

  function saveNotifs() {
    setNotifsError(null);
    startTransition(async () => {
      const res = await updateProfileAction({
        notificationPrefs: notifs as unknown as Record<string, boolean>,
      });
      if (!res.ok) {
        setNotifsError(res.error);
        return;
      }
      setNotifsSaved(true);
      setTimeout(() => setNotifsSaved(false), 3000);
    });
  }

  // Single avatar file — no small/medium/large variants. Same URL
  // for sidebar (80px) and main card (64px); the WebP is sized to
  // fit a 512px square at upload, well within budget for both.
  const sidebarAvatar = draft.avatarUrl;
  const mainAvatar = draft.avatarUrl;

  const pwStrength =
    pw.next.length === 0
      ? 0
      : pw.next.length < 6
        ? 1
        : pw.next.length < 10
          ? 2
          : pw.next.match(/[A-Z]/) &&
              pw.next.match(/[0-9]/) &&
              pw.next.match(/[^A-Za-z0-9]/)
            ? 4
            : 3;
  const pwStrengthLabel = ["", "Fraca", "Razoável", "Boa", "Excelente"][
    pwStrength
  ];
  const pwStrengthColor = [
    "",
    "bg-red-400",
    "bg-amber-400",
    "bg-blue-400",
    "bg-green-500",
  ][pwStrength];
  const pwStrengthText = [
    "",
    "text-red-500",
    "text-amber-500",
    "text-blue-500",
    "text-green-600",
  ][pwStrength];

  const sideNav: { key: Section; label: string; icon: string }[] = [
    { key: "perfil", label: "Informações do perfil", icon: "◎" },
    { key: "seguranca", label: "Segurança", icon: "⊛" },
    { key: "notificacoes", label: "Notificações", icon: "◈" },
    { key: "sessoes", label: "Sessão atual", icon: "◑" },
  ];

  return (
    <main className="bg-[#f6f7fb] p-6">
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-400">
        <Link href="/admin" className="transition-colors hover:text-[#0F2C6B]">
          Dashboard
        </Link>
        <span>/</span>
        <span className="font-semibold text-[#0F2C6B]">O meu perfil</span>
      </div>

      <div className="grid grid-cols-[260px_1fr] items-start gap-6">
        {/* Left sidebar */}
        <div className="space-y-4">
          {/* Avatar card */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 text-center">
            <div className="group relative mx-auto mb-4 h-20 w-20">
              {sidebarAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={sidebarAvatar}
                  alt={profile.name}
                  className="h-20 w-20 rounded-full border-4 border-[#0F2C6B]/10 object-cover"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full border-4 border-[#0F2C6B]/10 bg-[#0F2C6B]">
                  <span className="text-2xl font-black text-[#FFCC66]">
                    {profile.avatarInitials}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <span className="text-xs font-bold text-white">Editar</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatarFile}
              />
            </div>
            <h2 className="text-base font-black text-[#0F2C6B]">
              {profile.name}
            </h2>
            <span className="mt-1 inline-block rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-bold text-purple-700">
              {profile.role}
            </span>
            <p className="mt-2 text-xs leading-relaxed text-gray-400">
              {profile.bio || <span className="italic">Sem biografia</span>}
            </p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={avatarUploading}
              className="mt-4 w-full rounded-lg border border-gray-200 py-2 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
            >
              {avatarUploading ? "A carregar…" : "↑ Alterar foto"}
            </button>
            {avatarError && (
              <p className="mt-2 text-[11px] text-red-500">{avatarError}</p>
            )}
          </div>

          {/* Section nav */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
            {sideNav.map((item, i) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setSection(item.key)}
                className={`flex w-full items-center gap-3 px-5 py-3.5 text-left text-sm font-medium transition-colors ${i < sideNav.length - 1 ? "border-b border-gray-100" : ""} ${section === item.key ? "bg-[#0F2C6B] font-bold text-white" : "text-gray-600 hover:bg-gray-50"}`}
              >
                <span className="text-base">{item.icon}</span>
                {item.label}
                {section === item.key && (
                  <span className="ml-auto text-[#FFCC66]">›</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Right content */}
        <div className="space-y-5">
          {section === "perfil" && (
            <>
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <h2 className="mb-5 text-base font-black text-[#0F2C6B]">
                  Informações pessoais
                </h2>
                <div className="space-y-4">
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                      Nome completo
                    </label>
                    <input
                      value={draft.name}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, name: e.target.value }))
                      }
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm transition-colors focus:border-[#0F2C6B] focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                      placeholder="Nome completo"
                    />
                  </div>

                  {/* Email and role are managed by admins via the
                      Utilizadores page — read-only here. */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                        Endereço de email
                      </label>
                      <input
                        value={profile.email}
                        readOnly
                        disabled
                        className="w-full cursor-not-allowed rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500"
                      />
                      <p className="mt-1.5 text-xs text-gray-400">
                        Para alterar, contacte um administrador.
                      </p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                        Cargo / Função
                      </label>
                      <input
                        value={profile.role}
                        readOnly
                        disabled
                        className="w-full cursor-not-allowed rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-500"
                      />
                      <p className="mt-1.5 text-xs text-gray-400">
                        Definido pela administração.
                      </p>
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                      Telefone
                    </label>
                    <input
                      value={draft.phone}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, phone: e.target.value }))
                      }
                      type="tel"
                      className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm transition-colors focus:border-[#0F2C6B] focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                      placeholder="+351 9xx xxx xxx"
                    />
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                      Biografia
                    </label>
                    <textarea
                      value={draft.bio}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, bio: e.target.value }))
                      }
                      rows={3}
                      maxLength={200}
                      className="w-full resize-none rounded-xl border border-gray-200 px-4 py-2.5 text-sm transition-colors focus:border-[#0F2C6B] focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                      placeholder="Uma breve descrição sobre si..."
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      {draft.bio.length}/200 caracteres
                    </p>
                  </div>
                </div>
              </div>

              {/* Photo upload (now goes through the same WebP pipeline
                  used everywhere else in the admin). */}
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <h2 className="mb-1 text-base font-black text-[#0F2C6B]">
                  Foto de perfil
                </h2>
                <p className="mb-4 text-xs text-gray-400">
                  Recomendado: imagem quadrada com pelo menos 200×200 px (JPG
                  ou PNG, até 10 MB).
                </p>
                <div className="flex items-center gap-5">
                  <div className="relative h-16 w-16 shrink-0">
                    {mainAvatar ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={mainAvatar}
                        alt=""
                        className="h-16 w-16 rounded-full border-4 border-[#0F2C6B]/10 object-cover"
                      />
                    ) : (
                      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#0F2C6B]">
                        <span className="text-xl font-black text-[#FFCC66]">
                          {initials(draft.name) || "?"}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={avatarUploading}
                      className="flex items-center gap-2 rounded-xl border border-[#0F2C6B] px-4 py-2 text-sm font-bold text-[#0F2C6B] transition-colors hover:bg-[#0F2C6B] hover:text-white disabled:opacity-50"
                    >
                      {avatarUploading ? "A carregar…" : "↑ Carregar foto"}
                    </button>
                    {mainAvatar && (
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((d) => ({ ...d, avatarUrl: "" }))
                        }
                        className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-500 transition-colors hover:bg-red-50"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
                {avatarError && (
                  <p className="mt-3 text-xs text-red-600">{avatarError}</p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setDraft(profile)}
                  className="rounded-xl border border-gray-200 px-4 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-50 hover:text-gray-600"
                >
                  Cancelar alterações
                </button>
                <div className="flex items-center gap-3">
                  {saveError && (
                    <span className="text-sm font-bold text-red-600">
                      {saveError}
                    </span>
                  )}
                  {!saveError && saved && (
                    <span className="flex items-center gap-1.5 text-sm font-bold text-green-600">
                      ✓ Perfil guardado
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={saveProfile}
                    disabled={pending}
                    className="rounded-xl bg-[#0F2C6B] px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0A1F4E] disabled:opacity-50"
                  >
                    {pending ? "A guardar…" : "Guardar alterações"}
                  </button>
                </div>
              </div>
            </>
          )}

          {section === "seguranca" && (
            <>
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <h2 className="mb-1 text-base font-black text-[#0F2C6B]">
                  Alterar palavra-passe
                </h2>
                <p className="mb-5 text-xs text-gray-400">
                  A sua palavra-passe deve ter pelo menos 8 caracteres e incluir
                  letras maiúsculas, números e símbolos.
                </p>

                <div className="max-w-md space-y-4">
                  {(["current", "next", "confirm"] as const).map((field) => {
                    const labels = {
                      current: "Palavra-passe atual",
                      next: "Nova palavra-passe",
                      confirm: "Confirmar nova palavra-passe",
                    } as const;
                    return (
                      <div key={field}>
                        <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                          {labels[field]}
                        </label>
                        <div className="relative">
                          <input
                            type={showPw[field] ? "text" : "password"}
                            value={pw[field]}
                            onChange={(e) =>
                              setPw((p) => ({ ...p, [field]: e.target.value }))
                            }
                            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 pr-16 text-sm transition-colors focus:border-[#0F2C6B] focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowPw((s) => ({ ...s, [field]: !s[field] }))
                            }
                            aria-label={
                              showPw[field]
                                ? "Ocultar palavra-passe"
                                : "Mostrar palavra-passe"
                            }
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-gray-400 hover:text-gray-700"
                          >
                            {showPw[field] ? "Ocultar" : "Ver"}
                          </button>
                        </div>
                        {field === "next" && pw.next.length > 0 && (
                          <div className="mt-2">
                            <div className="mb-1 flex gap-1">
                              {[1, 2, 3, 4].map((i) => (
                                <div
                                  key={i}
                                  className={`h-1 flex-1 rounded-full ${i <= pwStrength ? pwStrengthColor : "bg-gray-100"}`}
                                />
                              ))}
                            </div>
                            <p className={`text-xs font-bold ${pwStrengthText}`}>
                              {pwStrengthLabel}
                            </p>
                          </div>
                        )}
                        {field === "confirm" &&
                          pw.confirm &&
                          pw.next !== pw.confirm && (
                            <p className="mt-1 text-xs text-red-500">
                              As palavras-passe não coincidem
                            </p>
                          )}
                        {field === "confirm" &&
                          pw.confirm &&
                          pw.next === pw.confirm &&
                          pw.confirm.length > 0 && (
                            <p className="mt-1 text-xs font-bold text-green-600">
                              ✓ Coincidem
                            </p>
                          )}
                      </div>
                    );
                  })}

                  {pwError && (
                    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">
                      {pwError}
                    </div>
                  )}
                  {pwSaved && (
                    <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
                      ✓ Palavra-passe alterada com sucesso.
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={savePassword}
                    disabled={pending}
                    className="rounded-xl bg-[#0F2C6B] px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0A1F4E] disabled:opacity-50"
                  >
                    {pending ? "A actualizar…" : "Atualizar palavra-passe"}
                  </button>
                </div>
              </div>

              {/* 2FA placeholder — leaves the door open for a future
                  TOTP integration without pretending it's already
                  working. */}
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="mb-1 flex items-center gap-2">
                      <h2 className="text-base font-black text-amber-700">
                        Autenticação em dois fatores
                      </h2>
                      <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
                        Em breve
                      </span>
                    </div>
                    <p className="max-w-md text-xs leading-relaxed text-amber-700/80">
                      A camada extra de segurança (código TOTP via app
                      autenticadora) será disponibilizada numa fase
                      posterior. Para já, recomenda-se uma palavra-passe
                      forte e única.
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {section === "notificacoes" && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="mb-1 text-base font-black text-[#0F2C6B]">
                Preferências de notificação
              </h2>
              <p className="mb-3 text-xs text-gray-400">
                Escolha que avisos quer receber. As preferências ficam
                guardadas na sua conta.
              </p>
              <div className="mb-5 flex items-start gap-2 rounded-lg border-l-4 border-amber-300 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                <span className="text-base">⚠</span>
                <p>
                  As preferências são guardadas, mas o envio real de
                  e-mails ainda não está activo — depende da integração
                  SMTP futura.
                </p>
              </div>
              <div className="space-y-0 divide-y divide-gray-100">
                {(
                  [
                    {
                      key: "newArticle",
                      label: "Novo artigo publicado",
                      desc: "Quando um artigo for publicado por qualquer membro da redação.",
                    },
                    {
                      key: "comments",
                      label: "Novos comentários",
                      desc: "Quando um leitor comentar num artigo da sua autoria.",
                    },
                    {
                      key: "newsletter",
                      label: "Relatórios de newsletter",
                      desc: "Estatísticas de abertura e cliques após cada envio.",
                    },
                    {
                      key: "weeklyReport",
                      label: "Relatório semanal",
                      desc: "Resumo de visitas, artigos e analytics às segundas-feiras.",
                    },
                    {
                      key: "systemAlerts",
                      label: "Alertas do sistema",
                      desc: "Erros técnicos, atualizações e manutenção programada.",
                    },
                    {
                      key: "loginAlerts",
                      label: "Alertas de acesso",
                      desc: "Notificação sempre que iniciar sessão de um novo dispositivo.",
                    },
                  ] as {
                    key: keyof NotificationPrefs;
                    label: string;
                    desc: string;
                  }[]
                ).map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-4 py-4"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-bold text-gray-800">
                        {item.label}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {item.desc}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setNotifs((n) => ({ ...n, [item.key]: !n[item.key] }))
                      }
                      aria-pressed={notifs[item.key]}
                      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full px-0.5 transition-colors ${notifs[item.key] ? "bg-[#0F2C6B]" : "bg-gray-300"}`}
                    >
                      <span
                        className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${notifs[item.key] ? "translate-x-5" : "translate-x-0"}`}
                      />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex items-center justify-end gap-3">
                {notifsError && (
                  <span className="text-sm font-semibold text-red-600">
                    {notifsError}
                  </span>
                )}
                {!notifsError && notifsSaved && (
                  <span className="text-sm font-semibold text-green-600">
                    ✓ Preferências guardadas
                  </span>
                )}
                <button
                  type="button"
                  onClick={saveNotifs}
                  disabled={pending}
                  className="rounded-xl bg-[#0F2C6B] px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0A1F4E] disabled:opacity-50"
                >
                  {pending ? "A guardar…" : "Guardar preferências"}
                </button>
              </div>
            </div>
          )}

          {section === "sessoes" && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="mb-1 text-base font-black text-[#0F2C6B]">
                Sessão atual
              </h2>
              <p className="mb-5 text-xs text-gray-400">
                Estado da sua autenticação neste dispositivo.
              </p>

              <div className="flex items-center gap-4 rounded-xl border border-[#0F2C6B]/20 bg-[#0F2C6B]/5 px-4 py-4">
                <span className="text-2xl">💻</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-gray-800">
                      Este dispositivo
                    </p>
                    <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                      ● Ligado
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Sessão autenticada via JWT. Para terminá-la, basta
                    fazer logout do menu superior.
                  </p>
                </div>
              </div>

              <div className="mt-5 flex items-start gap-3 rounded-xl border-l-4 border-amber-400 bg-amber-50 p-4">
                <span className="text-lg text-amber-500">ℹ</span>
                <div className="text-xs text-amber-900">
                  <p className="mb-1 font-bold uppercase tracking-wider text-amber-700">
                    Gestão de sessões — em breve
                  </p>
                  <p className="leading-relaxed">
                    A autenticação actual usa JWTs com expiração própria,
                    sem registo central de sessões. A listagem de
                    dispositivos activos e a opção &quot;terminar todas
                    as sessões&quot; serão adicionadas quando a autenticação
                    migrar para sessões com refresh-token persistente.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
