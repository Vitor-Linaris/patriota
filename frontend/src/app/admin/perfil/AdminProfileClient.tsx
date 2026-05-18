"use client";

import Link from "next/link";
import { useRef, useState } from "react";

interface ProfileData {
  name: string;
  email: string;
  role: string;
  bio: string;
  phone: string;
  avatarUrl: string;
  avatarInitials: string;
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
}

export default function AdminProfileClient({ initial }: Props) {
  const [section, setSection] = useState<Section>("perfil");
  const [profile, setProfile] = useState<ProfileData>(initial);
  const [draft, setDraft] = useState<ProfileData>(initial);
  const [saved, setSaved] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwSaved, setPwSaved] = useState(false);
  const [pwError, setPwError] = useState("");
  const [showPw, setShowPw] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const [notifs, setNotifs] = useState({
    newArticle: true,
    comments: true,
    newsletter: false,
    weeklyReport: true,
    systemAlerts: true,
    loginAlerts: true,
  });

  function handleAvatarFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const url = ev.target?.result as string;
      setAvatarPreview(url);
      setDraft((d) => ({ ...d, avatarUrl: url }));
    };
    reader.readAsDataURL(file);
  }

  function saveProfile() {
    const updated = { ...draft, avatarInitials: initials(draft.name) };
    if (avatarPreview) updated.avatarUrl = avatarPreview;
    setProfile(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  function savePassword() {
    setPwError("");
    if (!pw.current) {
      setPwError("Introduza a palavra-passe atual.");
      return;
    }
    if (pw.next.length < 8) {
      setPwError(
        "A nova palavra-passe deve ter pelo menos 8 caracteres.",
      );
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwError("As palavras-passe não coincidem.");
      return;
    }
    setPwSaved(true);
    setPw({ current: "", next: "", confirm: "" });
    setTimeout(() => setPwSaved(false), 3000);
  }

  const avatarSrc = avatarPreview || profile.avatarUrl;
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
    { key: "sessoes", label: "Sessões ativas", icon: "◑" },
  ];

  return (
    <main className="bg-[#f6f7fb] p-6">
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-400">
        <Link
          href="/admin"
          className="transition-colors hover:text-[#0F2C6B]"
        >
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
              {avatarSrc ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatarSrc}
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
              className="mt-4 w-full rounded-lg border border-gray-200 py-2 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50"
            >
              ↑ Alterar foto
            </button>
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

          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="mb-0.5 text-xs font-bold text-amber-700">
              Última sessão
            </p>
            <p className="text-xs text-amber-600">Hoje, 21:09 · Lisboa</p>
            <p className="mt-0.5 text-xs text-amber-500">Chrome · macOS</p>
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
                  <div className="grid grid-cols-2 gap-4">
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
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                        Cargo / Função
                      </label>
                      <input
                        value={draft.role}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, role: e.target.value }))
                        }
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm transition-colors focus:border-[#0F2C6B] focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                        placeholder="Ex: Jornalista, Editor..."
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                      Endereço de email
                    </label>
                    <div className="relative">
                      <input
                        value={draft.email}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, email: e.target.value }))
                        }
                        type="email"
                        className="w-full rounded-xl border border-gray-200 px-4 py-2.5 pr-24 text-sm transition-colors focus:border-[#0F2C6B] focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                        placeholder="email@opatriota.pt"
                      />
                      {draft.email !== profile.email && (
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-bold text-amber-600">
                          alterado
                        </span>
                      )}
                    </div>
                    <p className="mt-1.5 text-xs text-gray-400">
                      Será enviado um email de confirmação para o novo endereço.
                    </p>
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

              {/* Photo upload */}
              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <h2 className="mb-1 text-base font-black text-[#0F2C6B]">
                  Foto de perfil
                </h2>
                <p className="mb-4 text-xs text-gray-400">
                  Recomendado: imagem quadrada com pelo menos 200×200 px (JPG
                  ou PNG).
                </p>
                <div className="flex items-center gap-5">
                  <div className="relative h-16 w-16 shrink-0">
                    {avatarSrc ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={avatarSrc}
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
                      className="flex items-center gap-2 rounded-xl border border-[#0F2C6B] px-4 py-2 text-sm font-bold text-[#0F2C6B] transition-colors hover:bg-[#0F2C6B] hover:text-white"
                    >
                      ↑ Carregar foto
                    </button>
                    {avatarSrc && (
                      <button
                        type="button"
                        onClick={() => {
                          setAvatarPreview("");
                          setDraft((d) => ({ ...d, avatarUrl: "" }));
                        }}
                        className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-500 transition-colors hover:bg-red-50"
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
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
                  {saved && (
                    <span className="flex items-center gap-1.5 text-sm font-bold text-green-600">
                      ✓ Perfil guardado
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={saveProfile}
                    className="rounded-xl bg-[#0F2C6B] px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0A1F4E]"
                  >
                    Guardar alterações
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
                            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 pr-10 text-sm transition-colors focus:border-[#0F2C6B] focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                            placeholder="••••••••"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setShowPw((s) => ({ ...s, [field]: !s[field] }))
                            }
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600"
                          >
                            {showPw[field] ? "ocultar" : "ver"}
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
                            <p
                              className={`text-xs font-bold ${pwStrengthText}`}
                            >
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
                    className="rounded-xl bg-[#0F2C6B] px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0A1F4E]"
                  >
                    Atualizar palavra-passe
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="mb-1 text-base font-black text-[#0F2C6B]">
                      Autenticação em dois fatores
                    </h2>
                    <p className="max-w-sm text-xs text-gray-400">
                      Adicione uma camada extra de segurança. Ao ativar, será
                      pedido um código ao entrar.
                    </p>
                  </div>
                  <div className="ml-6 flex shrink-0 items-center gap-3">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-bold text-gray-400">
                      Inativo
                    </span>
                    <button
                      type="button"
                      className="rounded-lg bg-[#0F2C6B] px-4 py-2 text-xs font-bold text-white transition-colors hover:bg-[#0A1F4E]"
                    >
                      Ativar 2FA
                    </button>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-red-200 bg-white p-6">
                <h2 className="mb-1 text-base font-black text-red-600">
                  Zona de perigo
                </h2>
                <p className="mb-4 text-xs text-gray-400">
                  Ações irreversíveis relacionadas com a sua conta.
                </p>
                <div className="flex items-center justify-between rounded-xl border border-red-100 bg-red-50/50 px-4 py-3">
                  <div>
                    <p className="text-sm font-bold text-gray-800">
                      Terminar todas as sessões
                    </p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      Encerra sessão em todos os dispositivos exceto este.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-lg border border-red-200 px-4 py-2 text-xs font-bold text-red-500 transition-colors hover:bg-red-100"
                  >
                    Terminar sessões
                  </button>
                </div>
              </div>
            </>
          )}

          {section === "notificacoes" && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="mb-1 text-base font-black text-[#0F2C6B]">
                Preferências de notificação
              </h2>
              <p className="mb-6 text-xs text-gray-400">
                Escolha como e quando quer ser notificado.
              </p>
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
                    key: keyof typeof notifs;
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
                      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${notifs[item.key] ? "bg-[#0F2C6B]" : "bg-gray-200"}`}
                    >
                      <span
                        className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${notifs[item.key] ? "translate-x-5" : ""}`}
                      />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-5 flex justify-end">
                <button
                  type="button"
                  className="rounded-xl bg-[#0F2C6B] px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0A1F4E]"
                >
                  Guardar preferências
                </button>
              </div>
            </div>
          )}

          {section === "sessoes" && (
            <div className="rounded-2xl border border-gray-200 bg-white p-6">
              <h2 className="mb-1 text-base font-black text-[#0F2C6B]">
                Sessões ativas
              </h2>
              <p className="mb-5 text-xs text-gray-400">
                Dispositivos onde a sua conta está atualmente autenticada.
              </p>
              <div className="space-y-3">
                {[
                  {
                    device: "Chrome · macOS",
                    location: "Lisboa, Portugal",
                    time: "Agora · sessão atual",
                    icon: "💻",
                    current: true,
                  },
                  {
                    device: "Safari · iPhone 15",
                    location: "Lisboa, Portugal",
                    time: "Há 2 horas",
                    icon: "📱",
                    current: false,
                  },
                  {
                    device: "Chrome · Windows 11",
                    location: "Porto, Portugal",
                    time: "Há 3 dias",
                    icon: "🖥",
                    current: false,
                  },
                ].map((s, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-4 rounded-xl border px-4 py-4 ${s.current ? "border-[#0F2C6B]/20 bg-[#0F2C6B]/5" : "border-gray-100 bg-gray-50/50"}`}
                  >
                    <span className="text-2xl">{s.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-gray-800">
                          {s.device}
                        </p>
                        {s.current && (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
                            ● Este dispositivo
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-400">
                        {s.location} · {s.time}
                      </p>
                    </div>
                    {!s.current && (
                      <button
                        type="button"
                        className="shrink-0 rounded-lg border border-red-100 px-3 py-1.5 text-xs font-bold text-red-500 transition-colors hover:bg-red-50"
                      >
                        Terminar
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-5 border-t border-gray-100 pt-5">
                <button
                  type="button"
                  className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-bold text-red-500 transition-colors hover:bg-red-50"
                >
                  Terminar todas as outras sessões
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
