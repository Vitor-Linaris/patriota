"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RichTextEditor } from "@/components/admin/RichTextEditor";
import { CoverImagePicker } from "@/components/admin/CoverImagePicker";
import {
  ArticleBoxesEditor,
  type ArticleContextBoxes,
} from "@/components/admin/ArticleBoxesEditor";
import { imageVariant } from "@/lib/images";
import { adminMediaUrl } from "@/lib/media-preview";
import { FEATURES } from "@/lib/features";
import { Pagination } from "@/components/category/Pagination";
import {
  archiveArticleAction,
  autosaveArticleAction,
  createArticleAction,
  deleteArticleAction,
  discardDraftAction,
  publishArticleAction,
  rejectArticleAction,
  submitArticleAction,
  updateArticleAction,
  type ArticleFormPayload,
} from "./actions";
import { useAutosave } from "./useAutosave";
import { AutosaveIndicator } from "./AutosaveIndicator";

type ApiStatus =
  | "RASCUNHO"
  | "EM_REVISAO"
  | "AGENDADO"
  | "PUBLICADO"
  | "ARQUIVADO";
type UiStatus =
  | "publicado"
  | "rascunho"
  | "em_revisao"
  | "agendado"
  | "arquivado";

export interface AdminArticle {
  id: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  status: ApiStatus;
  exclusive: boolean;
  views: number;
  readMinutes: number;
  tags: string[];
  essentials: string[];
  context: { columns: { label: string; body: string }[] } | null;
  pullQuote: { quote: string; cite: string } | null;
  metaTitle: string;
  metaDescription: string;
  coverImage: string;
  /**
   * Edits parked on a live article: written by autosave or by "Guardar
   * alterações", not yet published. The fields above are what readers
   * see; this is what the newsroom is working on.
   */
  draft?: Record<string, unknown> | null;
  draftUpdatedAt?: string | null;
  /** The parked edits came from someone who cannot publish them. */
  draftAwaitingReview?: boolean;
  scheduledAt: string | null;
  createdAt: string;
  publishedAt: string | null;
  rejectionReason: string | null;
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  authorId: string;
  authorName: string;
}

export interface CategoryOption {
  id: string;
  name: string;
  slug: string;
  color: string;
  /** 0 for a top-level category, 1 for a subcategory, and so on. */
  depth: number;
}

const API_TO_UI: Record<ApiStatus, UiStatus> = {
  PUBLICADO: "publicado",
  RASCUNHO: "rascunho",
  EM_REVISAO: "em_revisao",
  AGENDADO: "agendado",
  ARQUIVADO: "arquivado",
};

const UI_TO_API: Record<UiStatus, ApiStatus> = {
  publicado: "PUBLICADO",
  rascunho: "RASCUNHO",
  em_revisao: "EM_REVISAO",
  agendado: "AGENDADO",
  arquivado: "ARQUIVADO",
};

const STATUS_CONFIG: Record<
  UiStatus,
  { label: string; color: string; dot: string }
> = {
  publicado: {
    label: "Publicado",
    color: "bg-green-100 text-green-700",
    dot: "bg-green-500",
  },
  rascunho: {
    label: "Rascunho",
    color: "bg-gray-100 text-gray-500",
    dot: "bg-gray-400",
  },
  em_revisao: {
    label: "Em revisão",
    color: "bg-purple-100 text-purple-700",
    dot: "bg-purple-500",
  },
  agendado: {
    label: "Agendado",
    color: "bg-blue-100 text-blue-700",
    dot: "bg-blue-500",
  },
  arquivado: {
    label: "Arquivado",
    color: "bg-amber-100 text-amber-700",
    dot: "bg-amber-500",
  },
};

const FILTERS: { key: UiStatus | "todos"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "publicado", label: "Publicados" },
  { key: "em_revisao", label: "Em revisão" },
  { key: "rascunho", label: "Rascunhos" },
  { key: "agendado", label: "Agendados" },
  { key: "arquivado", label: "Arquivados" },
];

const intFmt = new Intl.NumberFormat("pt-PT");
const dateFmt = new Intl.DateTimeFormat("pt-PT", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return dateFmt.format(new Date(iso));
  } catch {
    return "—";
  }
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 80);
}

interface EditorState {
  id?: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  status: UiStatus;
  exclusive: boolean;
  readMinutes: number;
  tags: string[];
  essentials: string[];
  context: ArticleContextBoxes["context"];
  pullQuote: ArticleContextBoxes["pullQuote"];
  metaTitle: string;
  metaDescription: string;
  coverImage: string;
  categoryId: string;
  rejectionReason: string | null;
  /**
   * ISO 8601 (UTC) — when set, "Publicar"/"Enviar para revisão" stores
   * the article as AGENDADO with this timestamp instead of going live
   * immediately. The backend cron flips AGENDADO→PUBLICADO at the date.
   */
  scheduledAt: string | null;
}

function emptyEditor(categoryId: string): EditorState {
  return {
    title: "",
    slug: "",
    summary: "",
    content: "",
    status: "rascunho",
    exclusive: false,
    readMinutes: 3,
    tags: [],
    essentials: [],
    context: null,
    pullQuote: null,
    metaTitle: "",
    metaDescription: "",
    coverImage: "",
    categoryId,
    rejectionReason: null,
    scheduledAt: null,
  };
}

/**
 * The live row, with any parked edits laid over the top.
 *
 * Without the overlay the editor would reopen showing the PUBLISHED
 * text while a newer draft sat in the database — the author's work
 * would look lost, and their next keystroke would autosave the old
 * version back over the new one. The draft is what the newsroom is
 * working on; the columns underneath are what readers still see.
 *
 * `coverImageUrl` is the one name that differs between the API payload
 * and this form's state (`coverImage`), so it is mapped by hand.
 */
function articleToEditor(a: AdminArticle): EditorState {
  const d: Record<string, unknown> = a.draft ?? {};
  const pick = <T,>(key: string, live: T): T =>
    d[key] !== undefined ? (d[key] as T) : live;

  return {
    id: a.id,
    title: pick("title", a.title),
    slug: pick("slug", a.slug),
    summary: pick("summary", a.summary),
    content: pick("content", a.content),
    status: API_TO_UI[a.status],
    exclusive: pick("exclusive", a.exclusive),
    readMinutes: pick("readMinutes", a.readMinutes),
    tags: pick("tags", a.tags),
    essentials: pick("essentials", a.essentials ?? []),
    context: pick("context", a.context ?? null),
    pullQuote: pick("pullQuote", a.pullQuote ?? null),
    metaTitle: pick("metaTitle", a.metaTitle),
    metaDescription: pick("metaDescription", a.metaDescription),
    coverImage: pick("coverImageUrl", a.coverImage),
    categoryId: pick("categoryId", a.categoryId),
    rejectionReason: a.rejectionReason,
    scheduledAt: a.scheduledAt,
  };
}

function ArticleEditor({
  initial,
  categories,
  onSave,
  onCancel,
  saving,
  error,
  canPublish,
  pendingDraft,
  onDiscardDraft,
}: {
  initial: EditorState;
  categories: CategoryOption[];
  onSave: (form: EditorState, publish: boolean) => void;
  onCancel: () => void;
  saving: boolean;
  error: string | null;
  canPublish: boolean;
  /** Set when the article opened with edits already parked from before. */
  pendingDraft: { updatedAt: string | null; awaitingReview: boolean } | null;
  onDiscardDraft: () => void;
}) {
  const [form, setForm] = useState<EditorState>(initial);
  const [tagInput, setTagInput] = useState("");
  const [seoOpen, setSeoOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  // Local draft of the date/time inputs so the user can fiddle before
  // committing. Pre-fill from form.scheduledAt when re-opening.
  const [scheduleDate, setScheduleDate] = useState(() =>
    form.scheduledAt ? new Date(form.scheduledAt).toISOString().slice(0, 10) : "",
  );
  const [scheduleTime, setScheduleTime] = useState(() => {
    if (!form.scheduledAt) return "08:00";
    const d = new Date(form.scheduledAt);
    return `${String(d.getUTCHours()).padStart(2, "0")}:${String(
      d.getUTCMinutes(),
    ).padStart(2, "0")}`;
  });
  const [editorKey] = useState(() => Math.random().toString(36).slice(2));

  const set = (patch: Partial<EditorState>) =>
    setForm((p) => ({ ...p, ...patch }));

  // ── Autosave ──────────────────────────────────────────────────────
  // The backend needs a title of 2+ chars and a category before it will
  // accept a create (CreateArticleDto), so there is nothing to save
  // until then — and pretending otherwise would just show the author a
  // string of validation failures they did not ask for.
  const isSaveable = form.title.trim().length >= 2 && Boolean(form.categoryId);

  // Opening an article and closing it again must change nothing. Without
  // this, merely clicking "Editar" on a live piece would write a pending
  // draft three seconds later and flag it for approval — a review task
  // out of thin air for an edit nobody made.
  const untouched = useMemo(
    () => JSON.stringify(form) === JSON.stringify(initial),
    [form, initial],
  );

  const isLive = form.status === "publicado";

  /**
   * What the autosave sends. Notably absent: `status` and `scheduledAt`.
   *
   * Omitting `status` is the whole reason autosave is safe on a
   * published article — see the note on autosaveArticleAction. The
   * manual buttons keep owning the lifecycle; this only ever preserves
   * words.
   */
  const runAutosave = useCallback(async () => {
    const result = await autosaveArticleAction(
      form.id,
      {
        title: form.title.trim(),
        slug: form.slug || undefined,
        summary: form.summary,
        content: form.content,
        categoryId: form.categoryId,
        exclusive: form.exclusive,
        readMinutes: form.readMinutes,
        tags: form.tags,
        essentials: form.essentials,
        context: form.context ?? undefined,
        pullQuote: form.pullQuote ?? undefined,
        metaTitle: form.metaTitle || undefined,
        metaDescription: form.metaDescription || undefined,
        coverImageUrl: form.coverImage || undefined,
      },
      isLive,
    );

    // First autosave of a new article created the row. Adopt its id, or
    // every later tick would create another article instead of updating
    // this one. (The manual flow never needed this: it closes the editor
    // immediately after saving.)
    if (result.ok && !form.id && result.id) set({ id: result.id });

    return result;
  }, [form, isLive]);

  const { status: autosaveStatus, cancelPending } = useAutosave({
    enabled: isSaveable && !untouched,
    data: form,
    onSave: runAutosave,
    // While a manual save is in flight it owns the article — a
    // concurrent autosave would race it and could re-send content the
    // user has already superseded by clicking Publicar.
    paused: saving,
  });

  const handleTitleChange = (title: string) => {
    set({
      title,
      slug: form.slug && form.id ? form.slug : slugify(title),
      metaTitle: form.metaTitle || title.slice(0, 70),
    });
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !form.tags.includes(t)) set({ tags: [...form.tags, t] });
    setTagInput("");
  };

  const removeTag = (tag: string) =>
    set({ tags: form.tags.filter((t) => t !== tag) });

  const isEditing = !!form.id;

  return (
    <div className="min-h-screen bg-[#F0F2F7] font-sans">
      <div className="sticky top-0 z-40 flex items-center justify-between gap-4 border-b border-gray-200 bg-white px-6 py-3 shadow-sm">
        <div className="flex min-w-0 items-center gap-4">
          <button
            onClick={onCancel}
            className="flex shrink-0 items-center gap-1.5 text-sm font-semibold text-gray-400 transition-colors hover:text-gray-600"
          >
            ← Voltar
          </button>
          <span className="text-gray-200">|</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-[#0F2C6B]">
              {form.title || (isEditing ? "Editar artigo" : "Novo artigo")}
            </p>
            <div className="mt-0.5 flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CONFIG[form.status].color}`}
              >
                {STATUS_CONFIG[form.status].label}
              </span>
              {error && (
                <span className="text-[10px] font-bold text-red-600">
                  {error}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="relative flex shrink-0 items-center gap-2">
          <button
            onClick={() => setSeoOpen(!seoOpen)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-50"
          >
            SEO
          </button>
          <button
            type="button"
            onClick={() => setScheduleOpen((v) => !v)}
            className={`rounded-lg border px-3 py-2 text-xs font-bold transition-colors ${
              form.scheduledAt
                ? "border-blue-300 bg-blue-50 text-blue-700"
                : "border-gray-200 text-gray-500 hover:bg-gray-50"
            }`}
          >
            {form.scheduledAt
              ? `◷ ${new Date(form.scheduledAt).toLocaleString("pt-PT", {
                  day: "2-digit",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                })}`
              : "◷ Agendar…"}
          </button>
          <AutosaveIndicator status={autosaveStatus} isLive={isLive} />
          <button
            disabled={saving}
            onClick={() => {
              cancelPending();
              onSave(form, false);
            }}
            className="rounded-lg border border-[#0F2C6B]/20 px-4 py-2 text-xs font-bold text-[#0F2C6B] transition-colors hover:bg-[#0F2C6B]/5 disabled:opacity-50"
          >
            {/* On a live article this no longer makes it a draft — it
                parks the edits. Saying "rascunho" there would promise a
                state change that does not happen. */}
            {isLive ? "Guardar alterações" : "Guardar rascunho"}
          </button>
          <button
            disabled={saving}
            onClick={() => {
              cancelPending();
              onSave(form, true);
            }}
            className="rounded-lg bg-[#0F2C6B] px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#1A3A7A] disabled:opacity-50"
          >
            {form.scheduledAt
              ? "Agendar publicação"
              : canPublish
                ? "Publicar"
                : "Enviar para revisão"}
          </button>

          {scheduleOpen && (
            <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-72 rounded-xl border border-gray-200 bg-white p-4 shadow-2xl">
              <p className="mb-1 text-sm font-black text-[#0F2C6B]">
                Agendar publicação
              </p>
              <p className="mb-3 text-[11px] text-gray-500">
                O artigo entra em modo agendado e é publicado
                automaticamente à hora indicada.
              </p>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Data
              </label>
              <input
                type="date"
                value={scheduleDate}
                onChange={(e) => setScheduleDate(e.target.value)}
                min={new Date().toISOString().slice(0, 10)}
                className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F2C6B] focus:outline-none"
              />
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                Hora (UTC)
              </label>
              <input
                type="time"
                value={scheduleTime}
                onChange={(e) => setScheduleTime(e.target.value)}
                className="mb-4 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F2C6B] focus:outline-none"
              />
              <div className="flex gap-2">
                {form.scheduledAt && (
                  <button
                    type="button"
                    onClick={() => {
                      set({ scheduledAt: null });
                      setScheduleOpen(false);
                    }}
                    className="flex-1 rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50"
                  >
                    Remover
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setScheduleOpen(false)}
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-500 hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={!scheduleDate}
                  onClick={() => {
                    const iso = new Date(
                      `${scheduleDate}T${scheduleTime || "08:00"}:00.000Z`,
                    ).toISOString();
                    set({ scheduledAt: iso });
                    setScheduleOpen(false);
                  }}
                  className="flex-1 rounded-lg bg-[#0F2C6B] px-3 py-2 text-xs font-bold text-white hover:bg-[#1A3A7A] disabled:opacity-50"
                >
                  Aplicar
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Opening a live article that already has parked edits shows the
          DRAFT text, not what readers see. Saying so out loud matters:
          otherwise the editor looks like the published article and
          someone could publish thinking nothing changed — or spend
          twenty minutes wondering why the site does not match. */}
      {pendingDraft && (
        <div
          className={`border-b px-6 py-3 ${
            pendingDraft.awaitingReview
              ? "border-amber-200 bg-amber-50"
              : "border-blue-200 bg-blue-50"
          }`}
        >
          <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3">
            <p
              className={`text-[13px] ${
                pendingDraft.awaitingReview
                  ? "text-amber-900"
                  : "text-blue-900"
              }`}
            >
              <strong className="font-bold">
                {pendingDraft.awaitingReview
                  ? "Alterações à espera de aprovação."
                  : "Alterações por publicar."}
              </strong>{" "}
              Está a ver a versão em curso. O site continua a mostrar a
              versão publicada
              {pendingDraft.updatedAt
                ? ` — alterações guardadas em ${new Date(
                    pendingDraft.updatedAt,
                  ).toLocaleString("pt-PT", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : ""}
              .
            </p>
            <button
              type="button"
              onClick={onDiscardDraft}
              disabled={saving}
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[11px] font-bold text-gray-600 transition-colors hover:border-red-300 hover:text-red-600 disabled:opacity-50"
            >
              Descartar alterações
            </button>
          </div>
        </div>
      )}

      <div className="mx-auto grid max-w-[1100px] grid-cols-12 gap-6 px-6 py-8">
        {/* MAIN */}
        <div className="col-span-12 space-y-5 xl:col-span-8">
          {form.rejectionReason && form.status === "rascunho" && (
            <div className="rounded-xl border-l-4 border-red-400 bg-red-50 px-5 py-4">
              <p className="text-xs font-black uppercase tracking-wider text-red-700">
                Artigo recusado
              </p>
              <p className="mt-1 text-sm text-red-900">
                {form.rejectionReason}
              </p>
              <p className="mt-2 text-[11px] text-red-600">
                Edite o artigo e re-envie para revisão quando estiver pronto.
              </p>
            </div>
          )}

          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <input
              value={form.title}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Título do artigo…"
              className="mb-3 w-full border-none text-2xl font-black leading-tight text-[#0F2C6B] placeholder:text-gray-300 focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-semibold text-gray-400">
                Slug:
              </span>
              <input
                value={form.slug}
                onChange={(e) => set({ slug: e.target.value })}
                placeholder="url-do-artigo"
                className="flex-1 border-b border-gray-100 bg-transparent py-0.5 font-mono text-xs text-gray-500 focus:border-[#0F2C6B] focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400">
              Resumo / Excerto
            </label>
            <textarea
              value={form.summary}
              onChange={(e) => set({ summary: e.target.value })}
              rows={3}
              placeholder="Breve descrição do artigo que aparece nas listagens e nas partilhas em redes sociais…"
              className="w-full resize-none border-none text-sm leading-relaxed text-gray-700 placeholder:text-gray-300 focus:outline-none"
            />
            <p className="mt-1 text-right text-[10px] text-gray-300">
              {form.summary.length}/200 caracteres
            </p>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <label className="mb-3 block text-xs font-bold uppercase tracking-wider text-gray-400">
              Caixas estruturadas — opcional
            </label>
            <ArticleBoxesEditor
              value={{
                essentials: form.essentials,
                context: form.context,
                pullQuote: form.pullQuote,
              }}
              onChange={(next) =>
                set({
                  essentials: next.essentials,
                  context: next.context,
                  pullQuote: next.pullQuote,
                })
              }
            />
          </div>

          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-[#F7F8FA] px-5 py-3">
              <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                Conteúdo do artigo
              </p>
            </div>
            <div className="p-1">
              <RichTextEditor
                key={editorKey}
                initialValue={form.content}
                onChange={(html) => set({ content: html })}
                minHeight={480}
              />
            </div>
          </div>

          {seoOpen && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                  SEO — Motores de pesquisa
                </p>
              </div>
              <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <p className="line-clamp-1 text-base font-medium text-[#1a0dab]">
                  {form.metaTitle || form.title || "Título do artigo"}
                </p>
                <p className="my-0.5 text-xs text-[#006621]">
                  opatriota.pt/artigo/{form.slug || "url-do-artigo"}
                </p>
                <p className="line-clamp-2 text-xs text-[#545454]">
                  {form.metaDescription ||
                    form.summary ||
                    "Descrição do artigo para motores de pesquisa…"}
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Meta título
                    </label>
                    <span className="text-[10px] font-bold text-gray-400">
                      {form.metaTitle.length}/70
                    </span>
                  </div>
                  <input
                    value={form.metaTitle}
                    onChange={(e) => set({ metaTitle: e.target.value })}
                    placeholder="Título optimizado para Google (max. 70 caracteres)"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                  />
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Meta descrição
                    </label>
                    <span className="text-[10px] font-bold text-gray-400">
                      {form.metaDescription.length}/160
                    </span>
                  </div>
                  <textarea
                    value={form.metaDescription}
                    onChange={(e) =>
                      set({ metaDescription: e.target.value })
                    }
                    rows={2}
                    placeholder="Descrição para Google (max. 160 caracteres)"
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* SIDEBAR */}
        <div className="col-span-12 space-y-4 xl:col-span-4">
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-400">
              Publicação
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-500">
                  Estado
                </label>
                <select
                  value={form.status}
                  onChange={(e) =>
                    set({ status: e.target.value as UiStatus })
                  }
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F2C6B] focus:outline-none"
                >
                  <option value="rascunho">Rascunho</option>
                  <option value="publicado">Publicado</option>
                  <option value="agendado">Agendado</option>
                  <option value="arquivado">Arquivado</option>
                </select>
              </div>
              {/* Hidden until paid subscriptions exist. The field and
                  the write path work; the paywall does not, so marking a
                  piece "subscribers only" today would change nothing
                  except mislead the newsroom. */}
              {FEATURES.subscriberPublishing && (
                <div className="flex items-center justify-between border-t border-gray-50 py-2">
                  <div>
                    <p className="text-sm font-bold text-gray-700">
                      Conteúdo Exclusivo
                    </p>
                    <p className="text-[10px] text-gray-400">
                      Só para assinantes
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => set({ exclusive: !form.exclusive })}
                    aria-pressed={form.exclusive}
                    className={`relative h-5 w-10 rounded-full transition-colors ${form.exclusive ? "bg-[#FFCC66]" : "bg-gray-200"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.exclusive ? "translate-x-5" : "translate-x-0.5"}`}
                    />
                  </button>
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-500">
                  Tempo de leitura (min){" "}
                  <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  min={1}
                  max={120}
                  value={form.readMinutes || ""}
                  // 0, not a silent 1: a cleared or invalid field has to
                  // read as genuinely empty so handleSave's check below
                  // can catch it and ask, instead of quietly writing a
                  // number nobody chose.
                  onChange={(e) =>
                    set({ readMinutes: Number(e.target.value) || 0 })
                  }
                  className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-[#0F2C6B] focus:outline-none ${
                    form.readMinutes < 1
                      ? "border-red-300"
                      : "border-gray-200"
                  }`}
                />
              </div>
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wider text-gray-400">
              Classificação
            </p>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500">
                Rubrica <span className="text-red-500">*</span>
              </label>
              <select
                value={form.categoryId}
                onChange={(e) => set({ categoryId: e.target.value })}
                className={`w-full rounded-lg border px-3 py-2 text-sm focus:border-[#0F2C6B] focus:outline-none ${
                  form.categoryId ? "border-gray-200" : "border-red-300"
                }`}
              >
                {/* Sem value (""), não pré-seleccionado num artigo
                    novo — ver o comentário em openNew(). Continua a
                    aparecer aqui, escondido, num artigo já gravado com
                    rubrica, para que o próprio valor guardado permaneça
                    seleccionável mesmo que a opção pareça "em falta". */}
                <option value="" disabled hidden>
                  Selecione uma rubrica…
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {/* "—" repeated by depth, not indentation via CSS:
                        a <select>'s own native <option> list ignores
                        margin/padding, so the only way to show "Sé"
                        nested under "Portugal › Madeira › Funchal" in
                        a plain dropdown is inside the text itself. */}
                    {c.depth > 0 ? `${"—".repeat(c.depth)} ` : ""}
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500">
                Tags
              </label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {form.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 rounded-full bg-[#0F2C6B]/10 px-2 py-0.5 text-[10px] font-bold text-[#0F2C6B]"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => removeTag(tag)}
                      className="leading-none text-[#0F2C6B]/40 hover:text-[#0F2C6B]"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTag();
                    }
                  }}
                  placeholder="Adicionar tag…"
                  className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-xs focus:border-[#0F2C6B] focus:outline-none"
                />
                <button
                  type="button"
                  onClick={addTag}
                  className="rounded-lg bg-gray-100 px-3 py-2 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-200"
                >
                  +
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-400">
              Imagem de capa
            </p>
            <CoverImagePicker
              value={form.coverImage}
              onChange={(url) => set({ coverImage: url })}
            />
          </div>

          <div className="space-y-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                cancelPending();
                onSave(form, true);
              }}
              className="w-full rounded-xl bg-[#0F2C6B] py-3 text-sm font-black text-white transition-colors hover:bg-[#1A3A7A] disabled:opacity-50"
            >
              {saving
                ? "A guardar…"
                : canPublish
                  ? "Publicar artigo"
                  : "Enviar para revisão"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                cancelPending();
                onSave(form, false);
              }}
              className="w-full rounded-xl border border-[#0F2C6B]/20 py-2.5 text-sm font-bold text-[#0F2C6B] transition-colors hover:bg-[#0F2C6B]/5 disabled:opacity-50"
            >
              {isLive ? "Guardar alterações" : "Guardar como rascunho"}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full rounded-xl border border-gray-100 py-2 text-sm text-gray-400 transition-colors hover:bg-gray-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminArticlesClient({
  initialArticles,
  totalArticles,
  currentPage,
  totalPages,
  searchQuery,
  activeStatus,
  statsTotal,
  statsByStatus,
  statsTotalViews,
  categories,
  canPublish,
  canApprove,
  canEditAll,
  canEditOwn,
  canDelete,
  myUserId,
  initialEditArticle,
}: {
  initialArticles: AdminArticle[];
  /** Matches the current view (page + filters) — drives the
   *  "X resultados" indicator under the table. */
  totalArticles: number;
  /** 1-based current page from ?page= query param. */
  currentPage: number;
  /** Total number of pages for the current filter set. */
  totalPages: number;
  /** Current text search from ?q=. Used to hydrate the search input
   *  on first render; subsequent edits push back to the URL. */
  searchQuery: string;
  /** Current ?status= filter. */
  activeStatus: ApiStatus | null;
  /** WHOLE-corpus total, ignoring filters — for the headline stat. */
  statsTotal: number;
  /** WHOLE-corpus per-status counts — drives the stat cards row. */
  statsByStatus: Record<ApiStatus, number>;
  /** WHOLE-corpus sum of views. */
  statsTotalViews: number;
  categories: CategoryOption[];
  canPublish: boolean;
  canApprove: boolean;
  /** artigos.editar_todos (or SUPER_ADMIN) — may edit anyone's piece. */
  canEditAll: boolean;
  /** artigos.editar_proprios — may edit only articles they authored. */
  canEditOwn: boolean;
  canDelete: boolean;
  /** Current user's id, to test authorship for canEditOwn. */
  myUserId: string;
  /** When the URL carries `?edit=<id>`, the server pre-loaded that
   *  article so we can open the editor on first render. Deep links
   *  from /admin/media use this. */
  initialEditArticle?: AdminArticle | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Local mirror of the search input so typing feels instant. We
  // debounce-push the value to the URL (and let the server re-render
  // with the new ?q=) — keeps the input snappy while still doing the
  // real search across the whole corpus on the backend.
  const [searchDraft, setSearchDraft] = useState(searchQuery);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminArticle | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Deep-link from /admin/media (or any `?edit=<id>` URL): on the
  // first render where the server hydrated `initialEditArticle`,
  // open the editor and clean the query param so refresh/back
  // doesn't re-open the editor over the user's current work.
  useEffect(() => {
    if (initialEditArticle) {
      setEditorState(articleToEditor(initialEditArticle));
      setEditorError(null);
      setEditorOpen(true);
      const params = new URLSearchParams(window.location.search);
      params.delete("edit");
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        qs ? `/admin/artigos?${qs}` : "/admin/artigos",
      );
    }
    // Run once per `initialEditArticle?.id` change — if the user
    // navigates back with a different id, we want to honor it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialEditArticle?.id]);

  // The articles ARE the page from the server; no client-side filter.
  const filtered = initialArticles;

  // Builds the next URL with the given updates applied. Empty values
  // are dropped so we get clean URLs (e.g. /admin/artigos instead of
  // /admin/artigos?q=&page=1&status=todos).
  const buildUrl = (
    updates: { q?: string | null; status?: ApiStatus | null; page?: number | null },
  ) => {
    const params = new URLSearchParams();
    const q = updates.q !== undefined ? updates.q : searchQuery;
    const status = updates.status !== undefined ? updates.status : activeStatus;
    const page = updates.page !== undefined ? updates.page : currentPage;
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (page && page > 1) params.set("page", String(page));
    const qs = params.toString();
    return qs ? `/admin/artigos?${qs}` : "/admin/artigos";
  };

  // Whenever search/filter changes we reset to page 1 (otherwise the
  // user could land on a now-empty page 5).
  const applySearch = (value: string) => {
    setSearchDraft(value);
    startTransition(() => {
      router.push(buildUrl({ q: value || null, page: 1 }));
    });
  };

  const applyStatus = (next: ApiStatus | null) => {
    startTransition(() => {
      router.push(buildUrl({ status: next, page: 1 }));
    });
  };

  // Stat-card counts come from /admin/articles/stats — always the
  // whole corpus, never just the current page.
  const counts = {
    publicado: statsByStatus.PUBLICADO ?? 0,
    em_revisao: statsByStatus.EM_REVISAO ?? 0,
    rascunho: statsByStatus.RASCUNHO ?? 0,
    agendado: statsByStatus.AGENDADO ?? 0,
    arquivado: statsByStatus.ARQUIVADO ?? 0,
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((a) => a.id)));
  };

  const run = (label: string, work: () => Promise<unknown>) => {
    startTransition(async () => {
      try {
        await work();
      } catch (e) {
        console.error(`${label} failed`, e);
      }
      router.refresh();
    });
  };

  const deleteOne = (id: string) => {
    if (!confirm("Eliminar este artigo? Esta acção não pode ser desfeita.")) {
      return;
    }
    run("delete", () => deleteArticleAction(id));
  };

  const deleteSelected = () => {
    if (selected.size === 0) return;
    if (!confirm(`Eliminar ${selected.size} artigos? Acção irreversível.`)) {
      return;
    }
    run("delete-bulk", async () => {
      await Promise.all([...selected].map((id) => deleteArticleAction(id)));
      setSelected(new Set());
    });
  };

  const publishSelected = () => {
    if (selected.size === 0) return;
    run("publish-bulk", async () => {
      await Promise.all([...selected].map((id) => publishArticleAction(id)));
      setSelected(new Set());
    });
  };

  const archiveSelected = () => {
    if (selected.size === 0) return;
    run("archive-bulk", async () => {
      await Promise.all([...selected].map((id) => archiveArticleAction(id)));
      setSelected(new Set());
    });
  };

  /**
   * Parked edits on the article currently open, if any. Read from the
   * row rather than tracked in editor state, so it reflects what the
   * server actually holds.
   */
  const openArticleId = editorState?.id;
  const editorPendingDraft = useMemo(() => {
    if (!openArticleId) return null;
    const row = initialArticles.find((a) => a.id === openArticleId);
    if (!row?.draft) return null;
    return {
      updatedAt: row.draftUpdatedAt ?? null,
      awaitingReview: Boolean(row.draftAwaitingReview),
    };
  }, [openArticleId, initialArticles]);

  const discardDraft = () => {
    const id = editorState?.id;
    if (!id) return;
    startTransition(async () => {
      const res = await discardDraftAction(id);
      if (!res.ok) {
        setEditorError(res.error);
        return;
      }
      // Reopen on the live version: the draft the form is showing no
      // longer exists, and leaving it on screen would let the next
      // keystroke autosave it straight back.
      setEditorOpen(false);
      setEditorState(null);
      router.refresh();
    });
  };

  const openNew = () => {
    if (categories.length === 0) {
      alert("Crie uma rubrica antes de criar artigos.");
      return;
    }
    // "", not categories[0].id: a rubrica pré-escolhida sozinha nunca
    // deixava "Escolha uma rubrica." disparar em handleSave — o campo
    // já vinha sempre preenchido, por isso "obrigatório" não pegava em
    // nada, e um artigo podia gravar-se na primeira categoria da lista
    // sem ninguém a ter escolhido de propósito. Vazio à partida obriga
    // a escolha real.
    setEditorState(emptyEditor(""));
    setEditorError(null);
    setEditorOpen(true);
  };

  const openEdit = (a: AdminArticle) => {
    setEditorState(articleToEditor(a));
    setEditorError(null);
    setEditorOpen(true);
  };

  const handleSave = async (form: EditorState, publish: boolean) => {
    if (!form.title.trim()) {
      setEditorError("O título é obrigatório.");
      return;
    }
    if (!form.categoryId) {
      setEditorError("Escolha uma rubrica.");
      return;
    }
    if (!form.readMinutes || form.readMinutes < 1) {
      setEditorError("Indique o tempo de leitura.");
      return;
    }
    setEditorError(null);

    const isScheduled = Boolean(form.scheduledAt);
    const isLive = form.status === "publicado";

    // Save-payload: we always save the row first as a "still pending"
    // state — never directly as PUBLICADO. The workflow transition is
    // then triggered by a dedicated server action so the backend is the
    // single source of truth on status.
    //   • scheduledAt set + publish → AGENDADO (cron will publish it)
    //   • plain publish → start from RASCUNHO, then call /publish
    //   • plain save → keep current status if it was scheduled,
    //     otherwise default to RASCUNHO
    let saveStatus: ApiStatus;
    if (publish && isScheduled) saveStatus = "AGENDADO";
    else if (publish) saveStatus = "RASCUNHO";
    else if (form.status === "agendado") saveStatus = "AGENDADO";
    else saveStatus = "RASCUNHO";

    const payload: ArticleFormPayload = {
      title: form.title.trim(),
      slug: form.slug || undefined,
      summary: form.summary,
      content: form.content,
      categoryId: form.categoryId,
      status: saveStatus,
      exclusive: form.exclusive,
      readMinutes: form.readMinutes,
      tags: form.tags,
      essentials: form.essentials,
      context: form.context ?? undefined,
      pullQuote: form.pullQuote ?? undefined,
      metaTitle: form.metaTitle || undefined,
      metaDescription: form.metaDescription || undefined,
      coverImageUrl: form.coverImage || undefined,
      scheduledAt: form.scheduledAt ?? undefined,
    };

    // "Guardar" on an article that is ON THE SITE stores the edits aside
    // instead of applying them — the same place autosave writes. It used
    // to send status: RASCUNHO, which took the piece off the site: an
    // editor fixing a comma and clicking Guardar would silently
    // unpublish it. The live version now stays up until someone
    // deliberately clicks Publicar, which promotes the pending edits.
    if (isLive && !publish && form.id) {
      const articleId = form.id;
      startTransition(async () => {
        const res = await autosaveArticleAction(articleId, payload, true);
        if (!res.ok) {
          setEditorError(res.error);
          return;
        }
        setEditorOpen(false);
        setEditorState(null);
        router.refresh();
      });
      return;
    }

    startTransition(async () => {
      let articleId = form.id;
      if (form.id) {
        const res = await updateArticleAction(form.id, payload);
        if (!res.ok) {
          setEditorError(res.error);
          return;
        }
      } else {
        const res = await createArticleAction(payload);
        if (!res.ok) {
          setEditorError(res.error);
          return;
        }
        articleId = res.id;
      }

      if (publish && articleId) {
        if (isScheduled) {
          // Scheduled path: row already saved as AGENDADO above. No
          // immediate transition — the backend cron handles it.
          // (Future enhancement: editors-in-chief might still want to
          // approve scheduled items; today we trust them.)
        } else if (canPublish) {
          // Publisher → straight to PUBLICADO via /publish.
          const transitionRes = await publishArticleAction(articleId);
          if (!transitionRes.ok) {
            setEditorError(transitionRes.error);
            return;
          }
        } else {
          // Non-publisher → EM_REVISAO via /submit.
          const transitionRes = await submitArticleAction(articleId);
          if (!transitionRes.ok) {
            setEditorError(transitionRes.error);
            return;
          }
        }
      }

      setEditorOpen(false);
      setEditorState(null);
      router.refresh();
    });
  };

  /** Approver-only: reject an article in review with optional reason. */
  const rejectArticle = (id: string, reason: string) => {
    startTransition(async () => {
      const res = await rejectArticleAction(id, reason);
      if (!res.ok) {
        alert(res.error);
        return;
      }
      router.refresh();
    });
  };

  if (editorOpen && editorState) {
    return (
      <ArticleEditor
        initial={editorState}
        categories={categories}
        onSave={handleSave}
        onCancel={() => {
          setEditorOpen(false);
          setEditorState(null);
        }}
        saving={pending}
        error={editorError}
        canPublish={canPublish}
        pendingDraft={editorPendingDraft}
        onDiscardDraft={discardDraft}
      />
    );
  }

  return (
    <main className="bg-[#f6f7fb] p-8">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#0F2C6B]">Artigos</h1>
          <p className="mt-1 text-sm text-gray-500">
            {intFmt.format(statsTotal)} artigos no total ·{" "}
            {intFmt.format(counts.publicado)} publicados ·{" "}
            {intFmt.format(statsTotalViews)} visitas acumuladas
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="flex shrink-0 items-center gap-2 rounded-xl bg-[#0F2C6B] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#1A3A7A]"
        >
          <span className="text-lg leading-none">+</span> Novo artigo
        </button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-5">
        {[
          {
            label: "Publicados",
            value: counts.publicado,
            color: "text-green-600",
            bg: "bg-green-50 border-green-100",
          },
          {
            label: "Em revisão",
            value: counts.em_revisao,
            color: "text-purple-600",
            bg: "bg-purple-50 border-purple-100",
          },
          {
            label: "Rascunhos",
            value: counts.rascunho,
            color: "text-gray-600",
            bg: "bg-gray-50 border-gray-100",
          },
          {
            label: "Agendados",
            value: counts.agendado,
            color: "text-blue-600",
            bg: "bg-blue-50 border-blue-100",
          },
          {
            label: "Arquivados",
            value: counts.arquivado,
            color: "text-amber-600",
            bg: "bg-amber-50 border-amber-100",
          },
        ].map((s) => (
          <div
            key={s.label}
            className={`flex items-center gap-3 rounded-xl border p-4 ${s.bg}`}
          >
            <p className={`text-3xl font-black ${s.color}`}>
              {intFmt.format(s.value)}
            </p>
            <p className="text-xs font-semibold text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center divide-x divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {FILTERS.map((f) => {
            const isActive =
              f.key === "todos"
                ? activeStatus === null
                : UI_TO_API[f.key as UiStatus] === activeStatus;
            const count =
              f.key === "todos"
                ? statsTotal
                : statsByStatus[UI_TO_API[f.key as UiStatus]] ?? 0;
            return (
              <button
                key={f.key}
                type="button"
                onClick={() =>
                  applyStatus(
                    f.key === "todos" ? null : UI_TO_API[f.key as UiStatus],
                  )
                }
                className={`whitespace-nowrap px-4 py-2 text-xs font-bold transition-colors ${isActive ? "bg-[#0F2C6B] text-white" : "text-gray-500 hover:bg-gray-50"}`}
              >
                {f.label}
                <span
                  className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] ${isActive ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"}`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4">
          <span className="text-sm text-gray-400">🔍</span>
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applySearch(searchDraft.trim());
              }
            }}
            onBlur={() => {
              if (searchDraft.trim() !== searchQuery) {
                applySearch(searchDraft.trim());
              }
            }}
            placeholder="Pesquisar em todo o site (Enter)…"
            className="flex-1 bg-transparent py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
          />
          {searchDraft && (
            <button
              type="button"
              onClick={() => applySearch("")}
              className="text-xs text-gray-300 hover:text-gray-500"
              aria-label="Limpar pesquisa"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#0F2C6B]/15 bg-[#0F2C6B]/5 px-4 py-3">
          <span className="text-sm font-bold text-[#0F2C6B]">
            {selected.size} seleccionados
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={publishSelected}
              disabled={pending}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              Publicar
            </button>
            <button
              type="button"
              onClick={archiveSelected}
              disabled={pending}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              Arquivar
            </button>
            {canDelete && (
              <button
                type="button"
                onClick={deleteSelected}
                disabled={pending}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                Eliminar
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="ml-1 text-xs text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-[#F7F8FA]">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={
                    selected.size === filtered.length && filtered.length > 0
                  }
                  onChange={toggleAll}
                  className="h-4 w-4 rounded accent-[#0F2C6B]"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                Artigo
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 lg:table-cell">
                Rubrica
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 xl:table-cell">
                Autor
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">
                Estado
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 xl:table-cell">
                Data
              </th>
              <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 lg:table-cell">
                Visitas
              </th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((a) => {
              const ui = API_TO_UI[a.status];
              const sc = STATUS_CONFIG[ui];
              // Mirrors assertCanEdit() in articles.service.ts, so
              // "Editar" never appears for a piece the backend would
              // then refuse with 403.
              const canEditRow =
                canEditAll || (canEditOwn && a.authorId === myUserId);
              return (
                <tr
                  key={a.id}
                  className={`transition-colors hover:bg-gray-50/50 ${selected.has(a.id) ? "bg-[#0F2C6B]/5" : ""}`}
                >
                  <td className="w-10 px-4 py-3.5">
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                      className="h-4 w-4 rounded accent-[#0F2C6B]"
                    />
                  </td>
                  <td className="max-w-xs px-4 py-3.5">
                    <div className="flex items-start gap-3">
                      {a.coverImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={
                            adminMediaUrl(
                              imageVariant(a.coverImage, "small") ??
                                a.coverImage,
                            ) ?? ""
                          }
                          alt=""
                          className="h-9 w-12 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#0F2C6B] to-[#1A3A7A] opacity-60">
                          <span className="text-[10px] font-black text-[#FFCC66]">
                            P
                          </span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-800">
                          {a.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {a.exclusive && (
                            <span className="inline-block rounded-full bg-[#FFCC66]/20 px-1.5 py-0.5 text-[9px] font-black text-[#8B6900]">
                              EXCLUSIVO
                            </span>
                          )}
                          {/* Shown for ANY parked edit, not just the
                              ones needing approval: the article row is
                              unchanged and still live, so without this
                              the pending work is invisible — including
                              to the person who wrote it. */}
                          {a.draft && (
                            <span
                              title={
                                a.draftAwaitingReview
                                  ? "Alterações guardadas à espera de aprovação. O que está no site não mudou."
                                  : "Alterações guardadas mas ainda não publicadas. O que está no site não mudou."
                              }
                              className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-black ${
                                a.draftAwaitingReview
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {a.draftAwaitingReview
                                ? "ALTERAÇÕES POR APROVAR"
                                : "ALTERAÇÕES POR PUBLICAR"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3.5 lg:table-cell">
                    <span
                      className="rounded-full px-2 py-0.5 text-[10px] font-black"
                      style={{
                        color: a.categoryColor,
                        backgroundColor: `${a.categoryColor}15`,
                      }}
                    >
                      {a.categoryName}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3.5 xl:table-cell">
                    <span className="text-xs text-gray-600">
                      {a.authorName}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${sc.color}`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${sc.dot}`}
                      />
                      {sc.label}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3.5 xl:table-cell">
                    <span className="text-xs text-gray-500">
                      {formatDate(a.publishedAt ?? a.createdAt)}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3.5 lg:table-cell">
                    <span className="text-xs font-semibold text-gray-700">
                      {a.views > 0 ? intFmt.format(a.views) : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      {a.status === "EM_REVISAO" && canApprove && (
                        <>
                          <button
                            type="button"
                            onClick={() => publishArticleAction(a.id).then(() => router.refresh())}
                            disabled={pending}
                            className="whitespace-nowrap rounded-lg bg-green-600 px-2.5 py-1.5 text-[11px] font-semibold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
                          >
                            Aprovar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRejectReason("");
                              setRejectTarget(a);
                            }}
                            disabled={pending}
                            className="whitespace-nowrap rounded-lg border border-red-200 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                          >
                            Recusar
                          </button>
                        </>
                      )}
                      {/*
                        "Ver" opens the admin preview in a new tab so
                        the reviewer can see exactly how the article
                        will render — works for any status (RASCUNHO,
                        EM_REVISAO, ...), the public /artigo/:slug
                        route only serves PUBLICADO.
                      */}
                      <a
                        href={`/admin/artigos/preview/${a.id}`}
                        target="_blank"
                        rel="noopener"
                        className="whitespace-nowrap rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-semibold text-gray-600 transition-colors hover:border-[#0F2C6B]/40 hover:text-[#0F2C6B]"
                        title="Ver pré-visualização"
                      >
                        Ver
                      </a>
                      {canEditRow && (
                        <button
                          type="button"
                          onClick={() => openEdit(a)}
                          className="whitespace-nowrap rounded-lg border border-[#0F2C6B]/20 px-2.5 py-1.5 text-[11px] font-semibold text-[#0F2C6B] transition-colors hover:bg-[#0F2C6B]/5"
                        >
                          Editar
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => deleteOne(a.id)}
                          disabled={pending}
                          className="rounded-lg border border-gray-100 px-2.5 py-1.5 text-[11px] text-gray-400 transition-colors hover:border-red-200 hover:text-red-600 disabled:opacity-50"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="py-14 text-center text-sm text-gray-400"
                >
                  Nenhum artigo encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-xs text-gray-400">
          <span>
            Página {currentPage} de {totalPages} ·{" "}
            {intFmt.format(totalArticles)}{" "}
            {totalArticles === 1 ? "resultado" : "resultados"}
            {(searchQuery || activeStatus) &&
              ` (de ${intFmt.format(statsTotal)} no total)`}
          </span>
          <Pagination
            current={currentPage}
            totalPages={totalPages}
            // Preserves the active filter and search across page
            // navigation so the user doesn't lose context when paging.
            hrefForPage={(p) => buildUrl({ page: p })}
            className="flex items-center gap-1 py-0"
          />
        </div>
      </div>

      {rejectTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setRejectTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-black text-[#0F2C6B]">
              Recusar artigo
            </h2>
            <p className="mt-1 truncate text-sm text-gray-500">
              “{rejectTarget.title}”
            </p>
            <label className="mt-5 mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
              Motivo (opcional)
            </label>
            <textarea
              autoFocus
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              maxLength={500}
              rows={4}
              placeholder="Ex.: faltam fontes oficiais, título ambíguo, etc."
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
            />
            <p className="mt-1 text-right text-[10px] text-gray-300">
              {rejectReason.length}/500
            </p>
            <p className="mt-3 text-[11px] text-gray-500">
              O artigo volta para os rascunhos do autor com este motivo
              anotado. Acção registada no histórico.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={() => setRejectTarget(null)}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  const target = rejectTarget;
                  setRejectTarget(null);
                  if (target) rejectArticle(target.id, rejectReason);
                }}
                className="flex-1 rounded-lg bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                Recusar artigo
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
