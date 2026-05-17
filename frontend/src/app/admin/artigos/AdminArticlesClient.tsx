"use client";

import { useRef, useState } from "react";
import { RichTextEditor } from "@/components/admin/RichTextEditor";

type Status = "publicado" | "rascunho" | "agendado" | "arquivado";

interface Article {
  id: number;
  title: string;
  author: string;
  category: string;
  status: Status;
  date: string;
  views: number;
  comments: number;
  premium: boolean;
  content?: string;
  summary?: string;
  coverImage?: string;
  slug?: string;
  tags?: string[];
  metaTitle?: string;
  metaDescription?: string;
}

const allArticles: Article[] = [
  { id: 1, title: "Governo apresenta proposta de orçamento com aumento de 3,2% na despesa pública", author: "Ana Ferreira", category: "Política", status: "publicado", date: "12 Abr 2026", views: 14200, comments: 47, premium: true, slug: "governo-orcamento-2026" },
  { id: 2, title: "FMI alerta para riscos de aceleração da dívida pública europeia", author: "Marta Sousa", category: "Economia", status: "publicado", date: "12 Abr 2026", views: 9800, comments: 31, premium: false, slug: "fmi-divida-publica-europeia" },
  { id: 3, title: "Greve dos professores paralisa escolas no Norte do país", author: "Carlos Neves", category: "Sociedade", status: "rascunho", date: "11 Abr 2026", views: 0, comments: 0, premium: false },
  { id: 4, title: "PS reage com críticas ao modelo de financiamento proposto pelo executivo", author: "Paulo Ferreira", category: "Política", status: "publicado", date: "11 Abr 2026", views: 7600, comments: 89, premium: false },
  { id: 5, title: "Banco de Portugal revê projeção do PIB em alta para 2026", author: "Marta Sousa", category: "Economia", status: "agendado", date: "13 Abr 2026", views: 0, comments: 0, premium: true },
  { id: 6, title: "Investigação: Contratos públicos sob escrutínio em três municípios", author: "Rui Cardoso", category: "Investigação", status: "publicado", date: "10 Abr 2026", views: 28000, comments: 134, premium: true },
  { id: 7, title: "Governo apresenta nova lei do arrendamento urbano", author: "Inês Rodrigues", category: "Política", status: "rascunho", date: "10 Abr 2026", views: 0, comments: 0, premium: false },
  { id: 8, title: "Festival NOS regressa ao Parque da Bela Vista em Julho", author: "Luís Monteiro", category: "Cultura", status: "publicado", date: "09 Abr 2026", views: 5100, comments: 12, premium: false },
  { id: 9, title: "Crise da habitação em Lisboa atinge novos máximos históricos", author: "Marta Sousa", category: "Sociedade", status: "publicado", date: "09 Abr 2026", views: 19400, comments: 201, premium: true },
  { id: 10, title: "Eleições autárquicas: sondagem dá vantagem ao PSD em Lisboa", author: "Ana Ferreira", category: "Política", status: "arquivado", date: "01 Mar 2026", views: 32000, comments: 87, premium: false },
  { id: 11, title: "Inteligência artificial na redacção: oportunidades e riscos para o jornalismo", author: "Sofia Pinto", category: "Tecnologia", status: "agendado", date: "14 Abr 2026", views: 0, comments: 0, premium: true },
  { id: 12, title: "TAP regista prejuízo de 120 milhões no primeiro trimestre", author: "Paulo Ferreira", category: "Economia", status: "publicado", date: "08 Abr 2026", views: 8900, comments: 56, premium: false },
];

const statusConfig: Record<Status, { label: string; color: string; dot: string }> = {
  publicado: { label: "Publicado", color: "bg-green-100 text-green-700", dot: "bg-green-500" },
  rascunho: { label: "Rascunho", color: "bg-gray-100 text-gray-500", dot: "bg-gray-400" },
  agendado: { label: "Agendado", color: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  arquivado: { label: "Arquivado", color: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
};

const categoryColors: Record<string, string> = {
  "Política": "text-[#0F2C6B] bg-[#0F2C6B]/10",
  "Economia": "text-emerald-700 bg-emerald-50",
  "Sociedade": "text-purple-700 bg-purple-50",
  "Investigação": "text-red-700 bg-red-50",
  "Cultura": "text-amber-700 bg-amber-50",
  "Tecnologia": "text-cyan-700 bg-cyan-50",
};

const categories = ["Política", "Economia", "Sociedade", "Investigação", "Cultura", "Tecnologia", "Mundo", "Desporto", "Saúde"];
const authors = ["Ana Ferreira", "Marta Sousa", "Carlos Neves", "Paulo Ferreira", "Rui Cardoso", "Inês Rodrigues", "Luís Monteiro", "Sofia Pinto"];

const filters: { key: Status | "todos"; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "publicado", label: "Publicados" },
  { key: "rascunho", label: "Rascunhos" },
  { key: "agendado", label: "Agendados" },
  { key: "arquivado", label: "Arquivados" },
];

function slugify(str: string) {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .slice(0, 60);
}

const emptyArticle: Partial<Article> = {
  title: "",
  author: authors[0],
  category: categories[0],
  status: "rascunho",
  premium: false,
  content: "",
  summary: "",
  coverImage: "",
  slug: "",
  tags: [],
  metaTitle: "",
  metaDescription: "",
};

function ArticleEditor({
  article,
  onSave,
  onCancel,
}: {
  article: Partial<Article>;
  onSave: (a: Partial<Article>) => void;
  onCancel: () => void;
}) {
  const [form, setForm] = useState<Partial<Article>>(article);
  const [tagInput, setTagInput] = useState("");
  const [seoOpen, setSeoOpen] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editorKey] = useState(() => Math.random().toString());

  const set = (patch: Partial<Article>) => setForm((p) => ({ ...p, ...patch }));

  const handleTitleChange = (title: string) => {
    set({ title, slug: slugify(title), metaTitle: title.slice(0, 70) });
  };

  const addTag = () => {
    const t = tagInput.trim();
    if (t && !(form.tags ?? []).includes(t)) {
      set({ tags: [...(form.tags ?? []), t] });
    }
    setTagInput("");
  };

  const removeTag = (tag: string) =>
    set({ tags: (form.tags ?? []).filter((t) => t !== tag) });

  const handleSave = (publish: boolean) => {
    onSave(publish ? { ...form, status: "publicado" } : form);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const isEditing = !!article.id;

  return (
    <div className="min-h-screen bg-[#F0F2F7] font-sans">
      {/* TOP BAR */}
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
              {form.status && (
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusConfig[form.status].color}`}>
                  {statusConfig[form.status].label}
                </span>
              )}
              {saved && <span className="text-[10px] font-bold text-green-600">✓ Guardado</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={() => setSeoOpen(!seoOpen)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-500 transition-colors hover:bg-gray-50"
          >
            SEO
          </button>
          <button
            onClick={() => handleSave(false)}
            className="rounded-lg border border-[#0F2C6B]/20 px-4 py-2 text-xs font-bold text-[#0F2C6B] transition-colors hover:bg-[#0F2C6B]/5"
          >
            Guardar rascunho
          </button>
          <button
            onClick={() => handleSave(true)}
            className="rounded-lg bg-[#0F2C6B] px-5 py-2 text-xs font-bold text-white transition-colors hover:bg-[#1A3A7A]"
          >
            Publicar
          </button>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1100px] grid-cols-12 gap-6 px-6 py-8">
        {/* MAIN */}
        <div className="col-span-12 space-y-5 xl:col-span-8">
          {/* TITLE */}
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
            <input
              value={form.title ?? ""}
              onChange={(e) => handleTitleChange(e.target.value)}
              placeholder="Título do artigo…"
              className="mb-3 w-full border-none text-2xl font-black leading-tight text-[#0F2C6B] placeholder:text-gray-300 focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-xs font-semibold text-gray-400">Slug:</span>
              <input
                value={form.slug ?? ""}
                onChange={(e) => set({ slug: e.target.value })}
                placeholder="url-do-artigo"
                className="flex-1 border-b border-gray-100 bg-transparent py-0.5 font-mono text-xs text-gray-500 focus:border-[#0F2C6B] focus:outline-none"
              />
            </div>
          </div>

          {/* SUMMARY */}
          <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-gray-400">
              Resumo / Excerto
            </label>
            <textarea
              value={form.summary ?? ""}
              onChange={(e) => set({ summary: e.target.value })}
              rows={3}
              placeholder="Breve descrição do artigo que aparece nas listagens e nas partilhas em redes sociais…"
              className="w-full resize-none border-none text-sm leading-relaxed text-gray-700 placeholder:text-gray-300 focus:outline-none"
            />
            <p className="mt-1 text-right text-[10px] text-gray-300">
              {(form.summary ?? "").length}/200 caracteres
            </p>
          </div>

          {/* EDITOR */}
          <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
            <div className="border-b border-gray-100 bg-[#F7F8FA] px-5 py-3">
              <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                Conteúdo do artigo
              </p>
            </div>
            <div className="p-1">
              <RichTextEditor
                key={editorKey}
                initialValue={form.content ?? ""}
                onChange={(html) => set({ content: html })}
                minHeight={480}
              />
            </div>
          </div>

          {/* SEO */}
          {seoOpen && (
            <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2">
                <p className="text-xs font-black uppercase tracking-wider text-gray-500">
                  SEO — Motores de pesquisa
                </p>
                <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
                  Google Preview
                </span>
              </div>
              <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-4">
                <p className="line-clamp-1 text-base font-medium text-[#1a0dab]">
                  {form.metaTitle || form.title || "Título do artigo"}
                </p>
                <p className="my-0.5 text-xs text-[#006621]">
                  opatriota.pt/artigos/{form.slug || "url-do-artigo"}
                </p>
                <p className="line-clamp-2 text-xs text-[#545454]">
                  {form.metaDescription || form.summary || "Descrição do artigo para motores de pesquisa…"}
                </p>
              </div>
              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      Meta título
                    </label>
                    <span
                      className={`text-[10px] font-bold ${(form.metaTitle ?? "").length > 60 ? "text-red-500" : "text-gray-400"}`}
                    >
                      {(form.metaTitle ?? "").length}/70
                    </span>
                  </div>
                  <input
                    value={form.metaTitle ?? ""}
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
                    <span
                      className={`text-[10px] font-bold ${(form.metaDescription ?? "").length > 155 ? "text-red-500" : "text-gray-400"}`}
                    >
                      {(form.metaDescription ?? "").length}/160
                    </span>
                  </div>
                  <textarea
                    value={form.metaDescription ?? ""}
                    onChange={(e) => set({ metaDescription: e.target.value })}
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
          {/* STATUS */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-400">
              Publicação
            </p>
            <div className="space-y-3">
              <div>
                <label className="mb-1.5 block text-xs font-bold text-gray-500">Estado</label>
                <select
                  value={form.status ?? "rascunho"}
                  onChange={(e) => set({ status: e.target.value as Status })}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F2C6B] focus:outline-none"
                >
                  <option value="rascunho">Rascunho</option>
                  <option value="publicado">Publicado</option>
                  <option value="agendado">Agendado</option>
                  <option value="arquivado">Arquivado</option>
                </select>
              </div>
              {form.status === "agendado" && (
                <div>
                  <label className="mb-1.5 block text-xs font-bold text-gray-500">
                    Data de publicação
                  </label>
                  <input
                    type="datetime-local"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F2C6B] focus:outline-none"
                  />
                </div>
              )}
              <div className="flex items-center justify-between border-t border-gray-50 py-2">
                <div>
                  <p className="text-sm font-bold text-gray-700">Conteúdo Premium</p>
                  <p className="text-[10px] text-gray-400">Requer subscrição para aceder</p>
                </div>
                <button
                  type="button"
                  onClick={() => set({ premium: !form.premium })}
                  aria-pressed={!!form.premium}
                  className={`relative h-5 w-10 rounded-full transition-colors ${form.premium ? "bg-[#FFCC66]" : "bg-gray-200"}`}
                >
                  <span
                    className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${form.premium ? "translate-x-5" : "translate-x-0.5"}`}
                  />
                </button>
              </div>
            </div>
          </div>

          {/* CATEGORY + AUTHOR */}
          <div className="space-y-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-black uppercase tracking-wider text-gray-400">
              Classificação
            </p>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500">Rubrica</label>
              <select
                value={form.category ?? ""}
                onChange={(e) => set({ category: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F2C6B] focus:outline-none"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500">Autor</label>
              <select
                value={form.author ?? ""}
                onChange={(e) => set({ author: e.target.value })}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-[#0F2C6B] focus:outline-none"
              >
                {authors.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-bold text-gray-500">Tags</label>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {(form.tags ?? []).map((tag) => (
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

          {/* COVER */}
          <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <p className="mb-3 text-xs font-black uppercase tracking-wider text-gray-400">
              Imagem de capa
            </p>
            {form.coverImage ? (
              <div className="relative mb-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.coverImage}
                  alt="capa"
                  className="aspect-video w-full rounded-xl object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = "none";
                  }}
                />
                <button
                  type="button"
                  onClick={() => set({ coverImage: "" })}
                  className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-black/50 text-xs text-white hover:bg-black/70"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="mb-3 flex aspect-video flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-200 bg-gray-50">
                <span className="text-2xl text-gray-300">🖼</span>
                <p className="text-[10px] font-semibold text-gray-400">
                  Sem imagem de capa
                </p>
              </div>
            )}
            <input
              value={form.coverImage ?? ""}
              onChange={(e) => set({ coverImage: e.target.value })}
              placeholder="Cole o URL da imagem de capa…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs focus:border-[#0F2C6B] focus:outline-none"
            />
          </div>

          {/* ACTIONS */}
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => handleSave(true)}
              className="w-full rounded-xl bg-[#0F2C6B] py-3 text-sm font-black text-white transition-colors hover:bg-[#1A3A7A]"
            >
              Publicar artigo
            </button>
            <button
              type="button"
              onClick={() => handleSave(false)}
              className="w-full rounded-xl border border-[#0F2C6B]/20 py-2.5 text-sm font-bold text-[#0F2C6B] transition-colors hover:bg-[#0F2C6B]/5"
            >
              Guardar como rascunho
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

export default function AdminArticlesClient() {
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<Status | "todos">("todos");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [articles, setArticles] = useState<Article[]>(allArticles);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingArticle, setEditingArticle] = useState<Partial<Article>>(emptyArticle);
  const nextId = useRef(allArticles.length + 1);

  const filtered = articles.filter((a) => {
    const q = search.toLowerCase();
    const matchSearch = a.title.toLowerCase().includes(q) || a.author.toLowerCase().includes(q);
    const matchStatus = activeFilter === "todos" || a.status === activeFilter;
    return matchSearch && matchStatus;
  });

  const counts: Record<string, number> = {
    todos: articles.length,
    publicado: articles.filter((a) => a.status === "publicado").length,
    rascunho: articles.filter((a) => a.status === "rascunho").length,
    agendado: articles.filter((a) => a.status === "agendado").length,
    arquivado: articles.filter((a) => a.status === "arquivado").length,
  };

  const toggleSelect = (id: number) => {
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
  const deleteSelected = () => {
    setArticles((prev) => prev.filter((a) => !selected.has(a.id)));
    setSelected(new Set());
  };
  const publishSelected = () => {
    setArticles((prev) =>
      prev.map((a) => (selected.has(a.id) ? { ...a, status: "publicado" as Status } : a)),
    );
    setSelected(new Set());
  };
  const deleteOne = (id: number) => {
    setArticles((prev) => prev.filter((a) => a.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const openNew = () => {
    setEditingArticle({ ...emptyArticle });
    setEditorOpen(true);
  };
  const openEdit = (a: Article) => {
    setEditingArticle(a);
    setEditorOpen(true);
  };

  const handleSave = (data: Partial<Article>) => {
    if (data.id) {
      setArticles((prev) =>
        prev.map((a) => (a.id === data.id ? ({ ...a, ...data } as Article) : a)),
      );
    } else {
      const newArticle: Article = {
        id: nextId.current++,
        title: data.title ?? "Sem título",
        author: data.author ?? authors[0],
        category: data.category ?? categories[0],
        status: data.status ?? "rascunho",
        date: new Date().toLocaleDateString("pt-PT", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        views: 0,
        comments: 0,
        premium: data.premium ?? false,
        content: data.content,
        summary: data.summary,
        coverImage: data.coverImage,
        slug: data.slug,
        tags: data.tags,
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
      };
      setArticles((prev) => [newArticle, ...prev]);
    }
    setEditorOpen(false);
  };

  if (editorOpen) {
    return (
      <ArticleEditor
        article={editingArticle}
        onSave={handleSave}
        onCancel={() => setEditorOpen(false)}
      />
    );
  }

  return (
    <main className="bg-[#f6f7fb] p-8">
      {/* HEADER */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#0F2C6B]">Artigos</h1>
          <p className="mt-1 text-sm text-gray-500">
            {articles.length} artigos no total · {counts.publicado} publicados
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

      {/* STATS */}
      <div className="mb-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { label: "Publicados", value: counts.publicado, color: "text-green-600", bg: "bg-green-50 border-green-100" },
          { label: "Rascunhos", value: counts.rascunho, color: "text-gray-600", bg: "bg-gray-50 border-gray-100" },
          { label: "Agendados", value: counts.agendado, color: "text-blue-600", bg: "bg-blue-50 border-blue-100" },
          { label: "Arquivados", value: counts.arquivado, color: "text-amber-600", bg: "bg-amber-50 border-amber-100" },
        ].map((s) => (
          <div
            key={s.label}
            className={`flex items-center gap-3 rounded-xl border p-4 ${s.bg}`}
          >
            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
            <p className="text-xs font-semibold text-gray-500">{s.label}</p>
          </div>
        ))}
      </div>

      {/* FILTERS + SEARCH */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex items-center divide-x divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setActiveFilter(f.key)}
              className={`whitespace-nowrap px-4 py-2 text-xs font-bold transition-colors ${activeFilter === f.key ? "bg-[#0F2C6B] text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              {f.label}
              <span
                className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[9px] ${activeFilter === f.key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-400"}`}
              >
                {counts[f.key]}
              </span>
            </button>
          ))}
        </div>
        <div className="flex min-w-48 flex-1 items-center gap-2 rounded-xl border border-gray-200 bg-white px-4">
          <span className="text-sm text-gray-400">🔍</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Pesquisar artigos ou autores…"
            className="flex-1 bg-transparent py-2.5 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
          />
        </div>
      </div>

      {/* BULK */}
      {selected.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-[#0F2C6B]/15 bg-[#0F2C6B]/5 px-4 py-3">
          <span className="text-sm font-bold text-[#0F2C6B]">
            {selected.size} seleccionados
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={publishSelected}
              className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-green-700"
            >
              Publicar
            </button>
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-blue-700"
            >
              Arquivar
            </button>
            <button
              type="button"
              onClick={deleteSelected}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-red-700"
            >
              Eliminar
            </button>
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

      {/* TABLE */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-100 bg-[#F7F8FA]">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.size === filtered.length && filtered.length > 0}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded accent-[#0F2C6B]"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Artigo</th>
              <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 lg:table-cell">Rubrica</th>
              <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 xl:table-cell">Autor</th>
              <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400">Estado</th>
              <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 xl:table-cell">Data</th>
              <th className="hidden px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-gray-400 lg:table-cell">Visitas</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filtered.map((a) => {
              const sc = statusConfig[a.status];
              const cc = categoryColors[a.category] ?? "text-gray-700 bg-gray-50";
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
                          src={a.coverImage}
                          alt=""
                          className="h-9 w-12 shrink-0 rounded-md object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-12 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-[#0F2C6B] to-[#1A3A7A] opacity-60">
                          <span className="text-[10px] font-black text-[#FFCC66]">P</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="line-clamp-2 text-sm font-semibold leading-snug text-gray-800">
                          {a.title}
                        </p>
                        {a.premium && (
                          <span className="mt-1 inline-block rounded-full bg-[#FFCC66]/20 px-1.5 py-0.5 text-[9px] font-black text-[#8B6900]">
                            PREMIUM
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3.5 lg:table-cell">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-black ${cc}`}>
                      {a.category}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3.5 xl:table-cell">
                    <span className="text-xs text-gray-600">{a.author}</span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold ${sc.color}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${sc.dot}`} />
                      {sc.label}
                    </span>
                  </td>
                  <td className="hidden px-4 py-3.5 xl:table-cell">
                    <span className="text-xs text-gray-500">{a.date}</span>
                  </td>
                  <td className="hidden px-4 py-3.5 lg:table-cell">
                    <span className="text-xs font-semibold text-gray-700">
                      {a.views > 0 ? a.views.toLocaleString() : "—"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(a)}
                        className="whitespace-nowrap rounded-lg border border-[#0F2C6B]/20 px-2.5 py-1.5 text-[11px] font-semibold text-[#0F2C6B] transition-colors hover:bg-[#0F2C6B]/5"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteOne(a.id)}
                        className="rounded-lg border border-gray-100 px-2.5 py-1.5 text-[11px] text-gray-400 transition-colors hover:border-red-200 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-14 text-center text-sm text-gray-400">
                  Nenhum artigo encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-xs text-gray-400">
          <span>
            Mostrando {filtered.length} de {articles.length} artigos
          </span>
          <div className="flex items-center gap-1">
            {[1, 2, 3, "…", 12].map((p, i) => (
              <button
                key={i}
                type="button"
                className={`h-7 w-7 rounded-md text-xs font-semibold transition-colors ${p === 1 ? "bg-[#0F2C6B] text-white" : "text-gray-500 hover:bg-gray-100"}`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
