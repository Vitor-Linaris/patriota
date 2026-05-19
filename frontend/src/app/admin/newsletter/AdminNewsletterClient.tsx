"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  createCampaignAction,
  sendCampaignAction,
  updateCampaignAction,
  type CampaignPayload,
} from "./actions";

type CampaignStatus = "enviada" | "rascunho" | "agendada";

export interface Campaign {
  id: string;
  subject: string;
  preview: string;
  segment: string;
  header: string;
  body: string;
  ctaText: string;
  ctaUrl: string;
  footer: string;
  status: CampaignStatus;
  date: string;
  scheduledAt: string | null;
  sentAt: string | null;
  opens: number;
  clicks: number;
  recipients: number;
  openRate: number;
  clickRate: number;
}

export interface Subscriber {
  id: string;
  email: string;
  name: string;
  joinedAt: string;
  status: "ativo" | "inativo" | "cancelado";
  segment: string;
  opens: number;
}

const STATUS_STYLES: Record<CampaignStatus, string> = {
  enviada: "bg-green-100 text-green-700",
  rascunho: "bg-gray-100 text-gray-600",
  agendada: "bg-blue-100 text-blue-700",
};

const STATUS_LABEL: Record<CampaignStatus, string> = {
  enviada: "● Enviada",
  rascunho: "○ Rascunho",
  agendada: "◷ Agendada",
};

const SUB_STATUS_STYLES: Record<string, string> = {
  ativo: "bg-green-100 text-green-700",
  inativo: "bg-amber-100 text-amber-700",
  cancelado: "bg-red-100 text-red-600",
};

type Tab = "campanhas" | "subscritores" | "segmentos";
type EditorStep = "assunto" | "conteudo" | "envio";

interface EditorState {
  subject: string;
  preview: string;
  segment: string;
  header: string;
  body: string;
  cta: string;
  ctaUrl: string;
  footer: string;
  scheduleDate: string;
  scheduleTime: string;
}

const SEGMENTS = ["Todos (9.450)", "Geral (5.800)", "Premium (2.100)", "Política (800)", "Economia (750)"];

export default function AdminNewsletterClient({
  initialCampaigns,
  initialSubscribers,
}: {
  initialCampaigns: Campaign[];
  initialSubscribers: Subscriber[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [tab, setTab] = useState<Tab>("campanhas");
  const campaigns = initialCampaigns;
  const subscribers = initialSubscribers;
  const [subFilter, setSubFilter] = useState<
    "todos" | "ativo" | "inativo" | "cancelado"
  >("todos");
  const [subSearch, setSubSearch] = useState("");
  const [camSearch, setCamSearch] = useState("");
  const [camFilter, setCamFilter] = useState<"todos" | CampaignStatus>(
    "todos",
  );
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorStep, setEditorStep] = useState<EditorStep>("assunto");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [sendConfirm, setSendConfirm] = useState<Campaign | null>(null);
  const [previewCampaign, setPreviewCampaign] = useState<Campaign | null>(
    null,
  );

  const [editor, setEditor] = useState<EditorState>({
    subject: "",
    preview: "",
    segment: SEGMENTS[0],
    header: "Destaques desta semana",
    body: "<p>Caro leitor,</p><p>Bem-vindo à newsletter semanal de <strong>O Patriota</strong>. Esta semana acompanhamos de perto os desenvolvimentos políticos, económicos e sociais que marcaram Portugal.</p><p>Abaixo encontrará os artigos mais relevantes da semana.</p>",
    cta: "Ler mais no site",
    ctaUrl: "https://opatriota.pt",
    footer: "Recebeu este email porque subscreveu a newsletter de O Patriota. Para cancelar a subscrição, clique aqui.",
    scheduleDate: "",
    scheduleTime: "08:00",
  });

  const steps: EditorStep[] = ["assunto", "conteudo", "envio"];
  const stepLabels: Record<EditorStep, string> = {
    assunto: "Assunto",
    conteudo: "Conteúdo",
    envio: "Envio",
  };

  function openNew() {
    setEditor({
      subject: "",
      preview: "",
      segment: SEGMENTS[0],
      header: "Destaques desta semana",
      body: "<p>Caro leitor,</p><p>Bem-vindo à newsletter semanal de <strong>O Patriota</strong>.</p>",
      cta: "Ler mais no site",
      ctaUrl: "https://opatriota.pt",
      footer:
        "Recebeu este email porque subscreveu a newsletter de O Patriota. Para cancelar a subscrição, clique aqui.",
      scheduleDate: "",
      scheduleTime: "08:00",
    });
    setEditingId(null);
    setEditorError(null);
    setEditorStep("assunto");
    setEditorOpen(true);
  }

  function openEdit(c: Campaign) {
    let scheduleDate = "";
    let scheduleTime = "08:00";
    if (c.scheduledAt) {
      const d = new Date(c.scheduledAt);
      scheduleDate = d.toISOString().slice(0, 10);
      scheduleTime = `${String(d.getHours()).padStart(2, "0")}:${String(
        d.getMinutes(),
      ).padStart(2, "0")}`;
    }
    setEditor({
      subject: c.subject,
      preview: c.preview,
      segment: c.segment || SEGMENTS[0],
      header: c.header,
      body: c.body,
      cta: c.ctaText,
      ctaUrl: c.ctaUrl,
      footer: c.footer,
      scheduleDate,
      scheduleTime,
    });
    setEditingId(c.id);
    setEditorError(null);
    setEditorStep("assunto");
    setEditorOpen(true);
  }

  function buildPayload(scheduledAt?: string): CampaignPayload {
    return {
      subject: editor.subject.trim(),
      preview: editor.preview,
      segment: editor.segment,
      header: editor.header,
      body: editor.body,
      ctaText: editor.cta,
      ctaUrl: editor.ctaUrl,
      footer: editor.footer,
      scheduledAt,
    };
  }

  function saveDraft() {
    if (!editor.subject.trim()) {
      setEditorError("Assunto obrigatório.");
      return;
    }
    setEditorError(null);
    const payload = buildPayload();
    startTransition(async () => {
      const res = editingId
        ? await updateCampaignAction(editingId, payload)
        : await createCampaignAction(payload);
      if (!res.ok) {
        setEditorError(res.error);
        return;
      }
      setEditorOpen(false);
      setEditingId(null);
      router.refresh();
    });
  }

  function schedule() {
    if (!editor.subject.trim()) {
      setEditorError("Assunto obrigatório.");
      return;
    }
    if (!editor.scheduleDate) {
      setEditorError("Escolha uma data de envio.");
      return;
    }
    setEditorError(null);
    const iso = new Date(
      `${editor.scheduleDate}T${editor.scheduleTime || "08:00"}:00`,
    ).toISOString();
    const payload = buildPayload(iso);
    startTransition(async () => {
      const res = editingId
        ? await updateCampaignAction(editingId, payload)
        : await createCampaignAction(payload);
      if (!res.ok) {
        setEditorError(res.error);
        return;
      }
      setEditorOpen(false);
      setEditingId(null);
      router.refresh();
    });
  }

  function sendNow() {
    if (!sendConfirm) return;
    const id = sendConfirm.id;
    startTransition(async () => {
      const res = await sendCampaignAction(id);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      setSendConfirm(null);
      router.refresh();
    });
  }

  const filteredCampaigns = campaigns.filter((c) => {
    const matchSearch = c.subject
      .toLowerCase()
      .includes(camSearch.toLowerCase());
    const matchFilter = camFilter === "todos" || c.status === camFilter;
    return matchSearch && matchFilter;
  });

  const filteredSubs = subscribers.filter((s) => {
    const matchSearch =
      s.email.toLowerCase().includes(subSearch.toLowerCase()) ||
      s.name.toLowerCase().includes(subSearch.toLowerCase());
    const matchFilter = subFilter === "todos" || s.status === subFilter;
    return matchSearch && matchFilter;
  });

  const totalSent = campaigns.filter((c) => c.status === "enviada").length;
  const avgOpen =
    campaigns
      .filter((c) => c.status === "enviada")
      .reduce((sum, c) => sum + c.openRate, 0) / (totalSent || 1);
  const activeSubs = subscribers.filter((s) => s.status === "ativo").length;

  // ── Editor overlay ──
  if (editorOpen) {
    const stepIdx = steps.indexOf(editorStep);
    return (
      <div className="min-h-screen bg-[#F0F2F7] font-sans">
        <div className="flex h-14 items-center gap-4 bg-[#0F2C6B] px-6">
          <button
            type="button"
            onClick={() => setEditorOpen(false)}
            className="flex items-center gap-2 text-sm text-white/60 hover:text-white"
          >
            ← Voltar
          </button>
          <span className="text-sm text-white/30">|</span>
          <span className="max-w-xs truncate text-sm font-bold text-white">
            {editor.subject || "Nova campanha"}
          </span>
          <div className="ml-auto flex items-center gap-3">
            <button
              type="button"
              onClick={saveDraft}
              className="rounded-lg border border-white/20 px-4 py-1.5 text-sm text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            >
              Guardar rascunho
            </button>
          </div>
        </div>

        <div className="flex items-center gap-0 border-b border-gray-200 bg-white px-6 py-3">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center">
              <button
                type="button"
                onClick={() => setEditorStep(s)}
                className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${editorStep === s ? "bg-[#0F2C6B] text-white" : i < stepIdx ? "bg-green-100 text-green-700" : "text-gray-400 hover:text-gray-600"}`}
              >
                {i < stepIdx ? "✓ " : `${i + 1}. `}
                {stepLabels[s]}
              </button>
              {i < steps.length - 1 && (
                <span className="mx-1 text-gray-300">→</span>
              )}
            </div>
          ))}
        </div>

        <div className="mx-auto max-w-5xl p-6">
          {editorStep === "assunto" && (
            <div className="space-y-5">
              <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="text-base font-bold text-[#0F2C6B]">
                  Configuração básica
                </h2>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Assunto do email *
                  </label>
                  <input
                    value={editor.subject}
                    onChange={(e) =>
                      setEditor((ed) => ({ ...ed, subject: e.target.value }))
                    }
                    placeholder="ex: 📰 Destaques da Semana — 19 Maio 2026"
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                  />
                  <p className="mt-1 text-xs text-gray-400">
                    {editor.subject.length}/100 caracteres
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Texto de pré-visualização
                  </label>
                  <input
                    value={editor.preview}
                    onChange={(e) =>
                      setEditor((ed) => ({ ...ed, preview: e.target.value }))
                    }
                    placeholder="Texto curto que aparece antes de abrir o email..."
                    className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Segmento de destinatários
                  </label>
                  <select
                    value={editor.segment}
                    onChange={(e) =>
                      setEditor((ed) => ({ ...ed, segment: e.target.value }))
                    }
                    className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                  >
                    {SEGMENTS.map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 bg-white p-6">
                <h3 className="mb-4 text-sm font-bold text-[#0F2C6B]">
                  Pré-visualização na caixa de entrada
                </h3>
                <div className="overflow-hidden rounded-xl border border-gray-200">
                  <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-4 py-2 text-xs text-gray-400">
                    <span className="h-2 w-2 rounded-full bg-red-400" />
                    <span className="h-2 w-2 rounded-full bg-amber-400" />
                    <span className="h-2 w-2 rounded-full bg-green-400" />
                    <span className="ml-2">Gmail — Caixa de entrada</span>
                  </div>
                  <div className="flex items-start gap-3 px-5 py-4">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F2C6B] text-xs font-black text-[#FFCC66]">
                      P
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="mb-0.5 flex items-baseline gap-2">
                        <span className="text-sm font-bold text-gray-900">
                          O Patriota
                        </span>
                        <span className="text-xs text-gray-400">
                          newsletter@opatriota.pt
                        </span>
                        <span className="ml-auto text-xs text-gray-400">
                          agora
                        </span>
                      </div>
                      <p className="truncate text-sm font-semibold text-gray-800">
                        {editor.subject || (
                          <span className="font-normal italic text-gray-400">
                            Assunto da campanha...
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-gray-400">
                        {editor.preview || (
                          <span className="italic">
                            Texto de pré-visualização...
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() =>
                    editor.subject.trim() && setEditorStep("conteudo")
                  }
                  disabled={!editor.subject.trim()}
                  className="rounded-lg bg-[#0F2C6B] px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0A1F4E] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Próximo: Conteúdo →
                </button>
              </div>
            </div>
          )}

          {editorStep === "conteudo" && (
            <div className="grid grid-cols-[1fr_360px] gap-6">
              <div className="space-y-5">
                <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-6">
                  <h2 className="text-base font-bold text-[#0F2C6B]">
                    Conteúdo do email
                  </h2>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                      Título do cabeçalho
                    </label>
                    <input
                      value={editor.header}
                      onChange={(e) =>
                        setEditor((ed) => ({ ...ed, header: e.target.value }))
                      }
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                    />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                      Corpo do email
                    </label>
                    <div className="overflow-hidden rounded-lg border border-gray-200">
                      <div className="flex flex-wrap gap-1 border-b border-gray-200 bg-gray-50 px-3 py-2">
                        {[
                          ["B", "bold"],
                          ["I", "italic"],
                          ["U", "underline"],
                        ].map(([lbl, cmd]) => (
                          <button
                            key={cmd}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              document.execCommand(cmd);
                            }}
                            className="h-7 w-7 rounded border border-gray-200 bg-white text-xs font-bold transition-colors hover:border-[#0F2C6B] hover:bg-[#0F2C6B] hover:text-white"
                          >
                            {lbl}
                          </button>
                        ))}
                        <div className="mx-1 h-6 w-px self-center bg-gray-200" />
                        {[
                          ["H2", "formatBlock", "h2"],
                          ["H3", "formatBlock", "h3"],
                          ["¶", "formatBlock", "p"],
                        ].map(([lbl, cmd, val]) => (
                          <button
                            key={lbl}
                            type="button"
                            onMouseDown={(e) => {
                              e.preventDefault();
                              document.execCommand(cmd, false, val);
                            }}
                            className="h-7 rounded border border-gray-200 bg-white px-2 text-xs font-bold transition-colors hover:border-[#0F2C6B] hover:bg-[#0F2C6B] hover:text-white"
                          >
                            {lbl}
                          </button>
                        ))}
                        <div className="mx-1 h-6 w-px self-center bg-gray-200" />
                        <button
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            document.execCommand("insertUnorderedList");
                          }}
                          className="h-7 w-7 rounded border border-gray-200 bg-white text-xs transition-colors hover:border-[#0F2C6B] hover:bg-[#0F2C6B] hover:text-white"
                        >
                          ≡
                        </button>
                      </div>
                      <div
                        contentEditable
                        suppressContentEditableWarning
                        className="min-h-48 p-4 text-sm leading-relaxed text-gray-800 focus:outline-none"
                        dangerouslySetInnerHTML={{ __html: editor.body }}
                        onInput={(e) =>
                          setEditor((ed) => ({
                            ...ed,
                            body: (e.target as HTMLDivElement).innerHTML,
                          }))
                        }
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                        Texto do botão CTA
                      </label>
                      <input
                        value={editor.cta}
                        onChange={(e) =>
                          setEditor((ed) => ({ ...ed, cta: e.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                        URL do botão
                      </label>
                      <input
                        value={editor.ctaUrl}
                        onChange={(e) =>
                          setEditor((ed) => ({ ...ed, ctaUrl: e.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                      Rodapé
                    </label>
                    <textarea
                      value={editor.footer}
                      onChange={(e) =>
                        setEditor((ed) => ({ ...ed, footer: e.target.value }))
                      }
                      rows={2}
                      className="w-full resize-none rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                    />
                  </div>
                </div>
                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={() => setEditorStep("assunto")}
                    className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                  >
                    ← Anterior
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditorStep("envio")}
                    className="rounded-lg bg-[#0F2C6B] px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0A1F4E]"
                  >
                    Próximo: Envio →
                  </button>
                </div>
              </div>

              <div className="sticky top-0">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-400">
                  Pré-visualização
                </p>
                <div className="overflow-hidden rounded-xl border border-gray-200 bg-white text-xs shadow-sm">
                  <div className="bg-[#0F2C6B] px-5 py-4 text-center">
                    <div className="mx-auto mb-1.5 flex h-8 w-8 items-center justify-center rounded bg-[#FFCC66]">
                      <span
                        className="text-sm font-black text-[#0F2C6B]"
                        style={{ fontFamily: "Georgia,serif" }}
                      >
                        P
                      </span>
                    </div>
                    <p
                      className="text-sm font-black text-white"
                      style={{ fontFamily: "Georgia,serif" }}
                    >
                      O Patriota
                    </p>
                    <p className="mt-0.5 text-[10px] uppercase tracking-widest text-white/50">
                      Notícias
                    </p>
                  </div>
                  <div className="border-b border-[#FFCC66] bg-[#FFFBEF] px-5 py-4">
                    <p className="text-sm font-bold text-[#0F2C6B]">
                      {editor.header || "Título do cabeçalho"}
                    </p>
                    <p className="mt-0.5 text-[11px] text-gray-500">
                      17 de maio de 2026
                    </p>
                  </div>
                  <div
                    className="space-y-2 border-b border-gray-100 px-5 py-4 text-[11px] leading-relaxed text-gray-700"
                    dangerouslySetInnerHTML={{ __html: editor.body }}
                  />
                  <div className="px-5 py-3 text-center">
                    <div className="inline-block rounded-lg bg-[#0F2C6B] px-4 py-2 text-[11px] font-bold text-white">
                      {editor.cta || "Botão CTA"}
                    </div>
                  </div>
                  <div className="border-t border-gray-100 bg-gray-50 px-5 py-3 text-center">
                    <p className="text-[10px] leading-relaxed text-gray-400">
                      {editor.footer}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {editorStep === "envio" && (
            <div className="space-y-5">
              <div className="space-y-5 rounded-xl border border-gray-200 bg-white p-6">
                <h2 className="text-base font-bold text-[#0F2C6B]">
                  Envio e agendamento
                </h2>

                <div className="grid grid-cols-3 gap-4 rounded-xl bg-[#F7F8FA] p-4">
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400">
                      Assunto
                    </p>
                    <p className="truncate text-sm font-medium text-gray-800">
                      {editor.subject}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400">
                      Destinatários
                    </p>
                    <p className="text-sm font-medium text-gray-800">
                      {editor.segment}
                    </p>
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400">
                      Remetente
                    </p>
                    <p className="text-sm font-medium text-gray-800">
                      newsletter@opatriota.pt
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-500">
                    Quando enviar?
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1.5 block text-xs text-gray-500">
                        Data
                      </label>
                      <input
                        type="date"
                        value={editor.scheduleDate}
                        onChange={(e) =>
                          setEditor((ed) => ({
                            ...ed,
                            scheduleDate: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                      />
                    </div>
                    <div>
                      <label className="mb-1.5 block text-xs text-gray-500">
                        Hora
                      </label>
                      <input
                        type="time"
                        value={editor.scheduleTime}
                        onChange={(e) =>
                          setEditor((ed) => ({
                            ...ed,
                            scheduleTime: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
                      />
                    </div>
                  </div>
                </div>

                <div className="divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {[
                    { label: "Assunto definido", ok: !!editor.subject.trim() },
                    {
                      label: "Conteúdo com corpo de texto",
                      ok: editor.body.length > 20,
                    },
                    { label: "Segmento selecionado", ok: !!editor.segment },
                    { label: "Botão CTA configurado", ok: !!editor.cta.trim() },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center gap-3 px-4 py-3"
                    >
                      <span
                        className={`text-sm font-bold ${item.ok ? "text-green-500" : "text-red-400"}`}
                      >
                        {item.ok ? "✓" : "✗"}
                      </span>
                      <span
                        className={`text-sm ${item.ok ? "text-gray-700" : "text-red-500"}`}
                      >
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setEditorStep("conteudo")}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                >
                  ← Anterior
                </button>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={saveDraft}
                    className="rounded-lg border border-gray-200 px-5 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-800"
                  >
                    Guardar rascunho
                  </button>
                  <button
                    type="button"
                    onClick={schedule}
                    disabled={!editor.scheduleDate}
                    className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    ◷ Agendar envio
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (editingId) {
                        // Existing campaign: persist edits then send.
                        startTransition(async () => {
                          const upd = await updateCampaignAction(
                            editingId,
                            buildPayload(),
                          );
                          if (!upd.ok) {
                            setEditorError(upd.error);
                            return;
                          }
                          const send = await sendCampaignAction(editingId);
                          if (!send.ok) {
                            setEditorError(send.error);
                            return;
                          }
                          setEditorOpen(false);
                          setEditingId(null);
                          router.refresh();
                        });
                        return;
                      }
                      // New campaign: create draft then send.
                      if (!editor.subject.trim()) {
                        setEditorError("Assunto obrigatório.");
                        return;
                      }
                      startTransition(async () => {
                        const created = await createCampaignAction(
                          buildPayload(),
                        );
                        if (!created.ok) {
                          setEditorError(created.error);
                          return;
                        }
                        const send = await sendCampaignAction(created.id);
                        if (!send.ok) {
                          setEditorError(send.error);
                          return;
                        }
                        setEditorOpen(false);
                        setEditingId(null);
                        router.refresh();
                      });
                    }}
                    disabled={pending}
                    className="rounded-lg bg-[#0F2C6B] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0A1F4E] disabled:opacity-50"
                  >
                    {pending ? "A enviar…" : "● Enviar agora"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Main list view ──
  return (
    <main className="bg-[#f6f7fb] p-8">
      {/* Send confirm modal */}
      {sendConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
            <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#0F2C6B]">
              <span className="text-2xl text-[#FFCC66]">✉</span>
            </div>
            <h2 className="mb-2 text-xl font-black text-[#0F2C6B]">
              Confirmar envio
            </h2>
            <p className="mb-1 text-sm text-gray-600">Vai enviar a campanha</p>
            <p className="mb-1 truncate px-4 text-sm font-bold text-gray-800">
              &ldquo;{sendConfirm.subject}&rdquo;
            </p>
            <p className="mb-6 text-sm text-gray-600">
              para{" "}
              <span className="font-bold text-[#0F2C6B]">
                9.450 subscritores
              </span>
              .<br />
              Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setSendConfirm(null)}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={sendNow}
                className="flex-1 rounded-lg bg-[#0F2C6B] py-2.5 text-sm font-bold text-white hover:bg-[#0A1F4E]"
              >
                Enviar agora
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Stats modal */}
      {previewCampaign && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setPreviewCampaign(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div className="min-w-0 flex-1 pr-4">
                <h2 className="truncate text-base font-black text-[#0F2C6B]">
                  {previewCampaign.subject}
                </h2>
                <p className="mt-0.5 text-xs text-gray-400">
                  Enviada em {previewCampaign.date}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewCampaign(null)}
                className="text-lg leading-none text-gray-400 hover:text-gray-600"
              >
                ✕
              </button>
            </div>
            <div className="mb-4 grid grid-cols-2 gap-3">
              {[
                { label: "Enviados", value: previewCampaign.recipients.toLocaleString("pt-PT"), icon: "✉" },
                { label: "Aberturas", value: `${previewCampaign.opens.toLocaleString("pt-PT")} (${previewCampaign.openRate}%)`, icon: "👁" },
                { label: "Cliques", value: `${previewCampaign.clicks.toLocaleString("pt-PT")} (${previewCampaign.clickRate}%)`, icon: "🔗" },
                { label: "Cancelamentos", value: Math.round(previewCampaign.recipients * 0.003).toString(), icon: "✗" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl bg-gray-50 px-4 py-3"
                >
                  <p className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400">
                    {stat.icon} {stat.label}
                  </p>
                  <p className="text-base font-black text-[#0F2C6B]">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wider text-gray-400">
                Taxa de abertura ao longo do tempo
              </p>
              <div className="flex h-16 items-end gap-1 rounded-xl bg-gray-50 px-3 py-2">
                {[12, 28, 45, 51, 51, 50, 51].map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-t bg-[#0F2C6B] opacity-80 transition-all"
                    style={{ height: `${h}%` }}
                  />
                ))}
              </div>
              <div className="mt-1 flex justify-between px-1 text-[10px] text-gray-300">
                {["6h", "12h", "18h", "1d", "2d", "3d", "7d"].map((l) => (
                  <span key={l}>{l}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-[#0F2C6B]">Newsletter</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Gerencie campanhas e subscritores
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="flex items-center gap-2 rounded-xl bg-[#0F2C6B] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#0A1F4E]"
        >
          + Nova campanha
        </button>
      </div>

      <div className="mb-6 grid grid-cols-4 gap-4">
        {[
          { label: "Subscritores ativos", value: activeSubs.toLocaleString("pt-PT"), sub: `de ${subscribers.length} total`, color: "text-[#0F2C6B]" },
          { label: "Campanhas enviadas", value: totalSent, sub: "este mês", color: "text-green-600" },
          { label: "Taxa de abertura média", value: `${avgOpen.toFixed(1)}%`, sub: "últimas campanhas", color: "text-blue-600" },
          { label: "Cancelamentos", value: subscribers.filter((s) => s.status === "cancelado").length, sub: "este mês", color: "text-amber-600" },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-gray-200 bg-white px-5 py-4"
          >
            <p className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-400">
              {stat.label}
            </p>
            <p className={`text-2xl font-black ${stat.color}`}>{stat.value}</p>
            <p className="mt-0.5 text-xs text-gray-400">{stat.sub}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 flex w-fit gap-1 rounded-xl bg-gray-100 p-1">
        {(["campanhas", "subscritores", "segmentos"] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-5 py-2 text-sm font-bold capitalize transition-colors ${tab === t ? "bg-white text-[#0F2C6B] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
          >
            {t === "campanhas"
              ? "Campanhas"
              : t === "subscritores"
                ? "Subscritores"
                : "Segmentos"}
          </button>
        ))}
      </div>

      {/* CAMPANHAS */}
      {tab === "campanhas" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
              {(["todos", "enviada", "agendada", "rascunho"] as const).map(
                (f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setCamFilter(f)}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${camFilter === f ? "bg-white text-[#0F2C6B] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    {f === "todos"
                      ? `Todas (${campaigns.length})`
                      : f === "enviada"
                        ? `Enviadas (${campaigns.filter((c) => c.status === "enviada").length})`
                        : f === "agendada"
                          ? `Agendadas (${campaigns.filter((c) => c.status === "agendada").length})`
                          : `Rascunhos (${campaigns.filter((c) => c.status === "rascunho").length})`}
                  </button>
                ),
              )}
            </div>
            <div className="relative max-w-xs flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">
                🔍
              </span>
              <input
                value={camSearch}
                onChange={(e) => setCamSearch(e.target.value)}
                placeholder="Pesquisar campanhas..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Campanha</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Envios</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Abertura</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Cliques</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Data</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredCampaigns.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-sm text-gray-400">
                      Nenhuma campanha encontrada
                    </td>
                  </tr>
                ) : (
                  filteredCampaigns.map((c) => (
                    <tr key={c.id} className="transition-colors hover:bg-gray-50/50">
                      <td className="px-5 py-4">
                        <p className="text-sm font-semibold text-gray-900">{c.subject}</p>
                        <p className="mt-0.5 max-w-xs truncate text-xs text-gray-400">{c.preview}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_STYLES[c.status]}`}>
                          {STATUS_LABEL[c.status]}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right text-sm font-medium text-gray-700">
                        {c.recipients ? c.recipients.toLocaleString("pt-PT") : "—"}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {c.status === "enviada" ? (
                          <div>
                            <span className="text-sm font-bold text-gray-800">{c.openRate}%</span>
                            <div className="ml-auto mt-1 h-1 w-16 rounded-full bg-gray-100">
                              <div className="h-1 rounded-full bg-green-400" style={{ width: `${c.openRate}%` }} />
                            </div>
                          </div>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-right">
                        {c.status === "enviada" ? (
                          <span className="text-sm font-bold text-gray-800">{c.clickRate}%</span>
                        ) : (
                          <span className="text-sm text-gray-300">—</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right text-xs text-gray-400">{c.date}</td>
                      <td className="px-4 py-4">
                        <div className="flex items-center justify-end gap-1">
                          {c.status !== "enviada" && (
                            <button
                              type="button"
                              onClick={() => setSendConfirm(c)}
                              className="rounded border border-[#0F2C6B]/20 px-2 py-1 text-xs font-bold text-[#0F2C6B] transition-colors hover:bg-[#0F2C6B] hover:text-white"
                            >
                              Enviar
                            </button>
                          )}
                          {c.status === "enviada" && (
                            <button
                              type="button"
                              onClick={() => setPreviewCampaign(c)}
                              className="rounded border border-gray-200 px-2 py-1 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-100"
                            >
                              Ver stats
                            </button>
                          )}
                          {/* Delete intentionally disabled — campaigns are append-only for audit. */}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBSCRITORES */}
      {tab === "subscritores" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
              {(["todos", "ativo", "inativo", "cancelado"] as const).map(
                (f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setSubFilter(f)}
                    className={`rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${subFilter === f ? "bg-white text-[#0F2C6B] shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                  >
                    {f === "todos"
                      ? `Todos (${subscribers.length})`
                      : f.charAt(0).toUpperCase() +
                        f.slice(1) +
                        ` (${subscribers.filter((s) => s.status === f).length})`}
                  </button>
                ),
              )}
            </div>
            <div className="relative max-w-sm flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">🔍</span>
              <input
                value={subSearch}
                onChange={(e) => setSubSearch(e.target.value)}
                placeholder="Pesquisar por nome ou email..."
                className="w-full rounded-lg border border-gray-200 bg-white py-2 pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/20"
              />
            </div>
            <button
              type="button"
              className="ml-auto flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
            >
              ↑ Exportar CSV
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Subscritor</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Segmento</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Aberturas</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-gray-400">Desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredSubs.map((s) => (
                  <tr key={s.id} className="transition-colors hover:bg-gray-50/50">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F2C6B]/10 text-xs font-black text-[#0F2C6B]">
                          {s.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900">{s.name}</p>
                          <p className="text-xs text-gray-400">{s.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <span className="rounded-full bg-[#0F2C6B]/10 px-2.5 py-1 text-xs font-bold text-[#0F2C6B]">{s.segment}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${SUB_STATUS_STYLES[s.status]}`}>
                        {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="h-1.5 w-16 rounded-full bg-gray-100">
                          <div className="h-1.5 rounded-full bg-[#0F2C6B]" style={{ width: `${Math.min(s.opens, 100)}%` }} />
                        </div>
                        <span className="text-sm font-bold text-gray-700">{s.opens}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right text-xs text-gray-400">{s.joinedAt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SEGMENTOS */}
      {tab === "segmentos" && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { name: "Geral", count: 5800, desc: "Todos os subscritores sem segmento específico", color: "#0F2C6B", pct: 61 },
            { name: "Premium", count: 2100, desc: "Subscritores com acesso a conteúdo premium", color: "#FFCC66", textColor: "#0F2C6B", pct: 22 },
            { name: "Política", count: 800, desc: "Interessados em análise e notícias políticas", color: "#6366F1", pct: 8 },
            { name: "Economia", count: 750, desc: "Foco em mercados, negócios e macroeconomia", color: "#10B981", pct: 8 },
            { name: "Sociedade", count: 420, desc: "Cultura, educação e vida social em Portugal", color: "#F59E0B", pct: 4 },
            { name: "Desporto", count: 310, desc: "Futebol, modalidades e desporto nacional", color: "#EF4444", pct: 3 },
          ].map((seg) => (
            <div
              key={seg.name}
              className="rounded-xl border border-gray-200 bg-white p-5 transition-shadow hover:shadow-sm"
            >
              <div className="mb-3 flex items-start justify-between">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl text-sm font-black"
                  style={{ background: seg.color, color: seg.textColor ?? "white" }}
                >
                  {seg.name[0]}
                </div>
                <span className="text-xs font-medium text-gray-400">{seg.pct}% do total</span>
              </div>
              <h3 className="mb-1 text-base font-bold text-[#0F2C6B]">{seg.name}</h3>
              <p className="mb-3 text-xs leading-relaxed text-gray-500">{seg.desc}</p>
              <div className="flex items-center justify-between">
                <span className="text-xl font-black text-[#0F2C6B]">{seg.count.toLocaleString("pt-PT")}</span>
                <span className="text-xs text-gray-400">subscritores</span>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                <div className="h-1.5 rounded-full" style={{ width: `${seg.pct}%`, background: seg.color }} />
              </div>
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  className="flex-1 rounded-lg border border-gray-200 py-1.5 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-50"
                >
                  Ver lista
                </button>
                <button
                  type="button"
                  onClick={openNew}
                  className="flex-1 rounded-lg bg-[#0F2C6B] py-1.5 text-xs font-bold text-white transition-colors hover:bg-[#0A1F4E]"
                >
                  Enviar campanha
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
