"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  addSubtopicAction,
  createCategoryAction,
  deleteCategoryAction,
  removeSubtopicAction,
  toggleCategoryVisibilityAction,
  updateCategoryAction,
} from "./actions";

interface SubTopic {
  id: string;
  label: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  visible: boolean;
  subtopics: SubTopic[];
}

const iconOptions = ["◆", "◈", "◎", "◉", "◇", "▣", "◑", "⊙", "◐", "◍"];

interface Props {
  initial: Category[];
}

export default function AdminCategoriesClient({ initial }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const categories = initial;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<Category>>({});
  const [showNew, setShowNew] = useState(false);
  const [newTag, setNewTag] = useState("");
  const [newCat, setNewCat] = useState({
    name: "",
    slug: "",
    description: "",
    icon: "◆",
    color: "#0F2C6B",
  });
  const [error, setError] = useState<string | null>(null);

  const refresh = () => router.refresh();

  const wrap = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Falha.");
      else {
        setError(null);
        refresh();
      }
    });

  const startEdit = (c: Category) => {
    setEditingId(c.id);
    setEditData({
      name: c.name,
      slug: c.slug,
      description: c.description,
      icon: c.icon,
      color: c.color,
    });
  };

  const saveEdit = (id: string) => {
    wrap(async () => updateCategoryAction(id, editData));
    setEditingId(null);
  };

  const toggleVisible = (id: string, current: boolean) =>
    wrap(async () => toggleCategoryVisibilityAction(id, !current));

  const removeSub = (catId: string, subId: string) =>
    wrap(async () => removeSubtopicAction(catId, subId));

  const addSub = (catId: string) => {
    const label = newTag.trim();
    if (!label) return;
    wrap(async () => addSubtopicAction(catId, { label }));
    setNewTag("");
  };

  const addCategory = () => {
    if (!newCat.name.trim()) return;
    wrap(async () => createCategoryAction(newCat));
    setNewCat({ name: "", slug: "", description: "", icon: "◆", color: "#0F2C6B" });
    setShowNew(false);
  };

  const deleteCategory = (id: string) =>
    wrap(async () => deleteCategoryAction(id));

  return (
    <main className="bg-[#f6f7fb] p-8">
      {showNew && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowNew(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-5 text-xl font-black text-[#0F2C6B]">Nova categoria</h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Nome</label>
                  <input
                    value={newCat.name}
                    onChange={(e) => setNewCat((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Ex: Desporto"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Slug</label>
                  <input
                    value={newCat.slug}
                    onChange={(e) => setNewCat((p) => ({ ...p, slug: e.target.value }))}
                    placeholder="ex: desporto"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 font-mono text-sm focus:border-[#0F2C6B] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Descrição</label>
                <textarea
                  value={newCat.description}
                  onChange={(e) => setNewCat((p) => ({ ...p, description: e.target.value }))}
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Ícone</label>
                  <div className="flex flex-wrap gap-1.5">
                    {iconOptions.map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() => setNewCat((p) => ({ ...p, icon: ic }))}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg text-base ${newCat.icon === ic ? "bg-[#0F2C6B] text-[#FFCC66]" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">Cor</label>
                  <input
                    type="color"
                    value={newCat.color}
                    onChange={(e) => setNewCat((p) => ({ ...p, color: e.target.value }))}
                    className="h-10 w-full cursor-pointer rounded-lg border border-gray-200"
                  />
                </div>
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowNew(false)}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={addCategory}
                disabled={isPending}
                className="flex-1 rounded-lg bg-[#0F2C6B] py-2.5 text-sm font-bold text-white hover:bg-[#1A3A7A] disabled:opacity-50"
              >
                {isPending ? "A criar…" : "Criar categoria"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#0F2C6B]">Categorias</h1>
          <p className="mt-1 text-sm text-gray-500">
            {categories.length} rubricas · {categories.filter((c) => c.visible).length} visíveis no site
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowNew(true)}
          className="shrink-0 rounded-lg bg-[#0F2C6B] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#1A3A7A]"
        >
          + Nova categoria
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="space-y-3">
        {categories.map((cat) => {
          const isEditing = editingId === cat.id;
          return (
            <div
              key={cat.id}
              className={`rounded-xl border bg-white transition-all ${isEditing ? "border-[#0F2C6B]/30 shadow-md" : "border-gray-200 shadow-sm"}`}
            >
              <div className="flex items-center gap-4 p-4">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg text-white shadow-sm"
                  style={{ backgroundColor: isEditing ? (editData.color ?? cat.color) : cat.color }}
                >
                  {isEditing ? (editData.icon ?? cat.icon) : cat.icon}
                </div>

                {isEditing ? (
                  <div className="grid flex-1 grid-cols-2 gap-3">
                    <input
                      value={editData.name ?? ""}
                      onChange={(e) => setEditData((p) => ({ ...p, name: e.target.value }))}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-bold focus:border-[#0F2C6B] focus:outline-none"
                    />
                    <input
                      value={editData.slug ?? ""}
                      onChange={(e) => setEditData((p) => ({ ...p, slug: e.target.value }))}
                      className="rounded-lg border border-gray-200 px-3 py-1.5 font-mono text-sm focus:border-[#0F2C6B] focus:outline-none"
                    />
                    <input
                      value={editData.description ?? ""}
                      onChange={(e) => setEditData((p) => ({ ...p, description: e.target.value }))}
                      className="col-span-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                    />
                    <div className="col-span-2 flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-500">Ícone:</span>
                      {iconOptions.map((ic) => (
                        <button
                          key={ic}
                          type="button"
                          onClick={() => setEditData((p) => ({ ...p, icon: ic }))}
                          className={`flex h-7 w-7 items-center justify-center rounded text-sm ${(editData.icon ?? cat.icon) === ic ? "bg-[#0F2C6B] text-[#FFCC66]" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                        >
                          {ic}
                        </button>
                      ))}
                      <span className="ml-2 text-xs font-semibold text-gray-500">Cor:</span>
                      <input
                        type="color"
                        value={editData.color ?? cat.color}
                        onChange={(e) => setEditData((p) => ({ ...p, color: e.target.value }))}
                        className="h-7 w-8 cursor-pointer rounded border border-gray-200"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-[#0F2C6B]">{cat.name}</h3>
                      <span className="font-mono text-xs text-gray-400">/{cat.slug}</span>
                      {!cat.visible && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">OCULTA</span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">{cat.description}</p>
                  </div>
                )}

                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={cat.visible}
                    aria-label={
                      cat.visible
                        ? "Ocultar do menu público"
                        : "Mostrar no menu público"
                    }
                    onClick={() => toggleVisible(cat.id, cat.visible)}
                    disabled={isPending}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/30 disabled:opacity-50 ${
                      cat.visible
                        ? "border-green-600 bg-green-500"
                        : "border-gray-300 bg-gray-200"
                    }`}
                  >
                    <span
                      aria-hidden
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${
                        cat.visible ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                  <span
                    className={`text-[11px] font-semibold ${cat.visible ? "text-green-700" : "text-gray-400"}`}
                  >
                    {cat.visible ? "Visível" : "Oculta"}
                  </span>

                  {isEditing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(cat.id)}
                        disabled={isPending}
                        className="rounded-lg bg-[#0F2C6B] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1A3A7A] disabled:opacity-50"
                      >
                        Guardar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => startEdit(cat)}
                        className="rounded-lg border border-[#0F2C6B]/20 px-2.5 py-1.5 text-xs font-semibold text-[#0F2C6B] hover:bg-[#0F2C6B]/5"
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteCategory(cat.id)}
                        disabled={isPending}
                        className="rounded-lg border border-gray-100 px-2 py-1.5 text-xs text-gray-300 transition-colors hover:border-red-200 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-gray-50 px-4 py-3">
                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                  Sub-tópicos:
                </span>
                {cat.subtopics.map((s) => (
                  <span
                    key={s.id}
                    className="group inline-flex items-center gap-1 rounded-full bg-[#F0F2F7] px-2.5 py-1 text-[11px] font-semibold text-[#0F2C6B]"
                  >
                    {s.label}
                    <button
                      type="button"
                      onClick={() => removeSub(cat.id, s.id)}
                      className="ml-0.5 leading-none text-gray-300 hover:text-red-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={editingId === cat.id ? newTag : ""}
                  onFocus={() => editingId !== cat.id && setEditingId(cat.id)}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSub(cat.id);
                    }
                  }}
                  placeholder="+ Adicionar…"
                  className="w-28 rounded-full border border-dashed border-gray-200 px-2.5 py-0.5 text-[11px] text-gray-400 focus:border-[#0F2C6B] focus:text-gray-700 focus:outline-none"
                />
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}
