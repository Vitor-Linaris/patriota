"use client";

import { useState } from "react";

interface SubTopic {
  id: number;
  label: string;
}

interface Category {
  id: number;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  articles: number;
  visible: boolean;
  order: number;
  subtopics: SubTopic[];
}

const initialCategories: Category[] = [
  { id: 1, name: "Política", slug: "politica", description: "Cobertura completa da vida política portuguesa — parlamento, governo, partidos e eleições.", icon: "◆", color: "#1e40af", articles: 8, visible: true, order: 1, subtopics: [{ id: 1, label: "Orçamento 2026" }, { id: 2, label: "Parlamento" }, { id: 3, label: "Governo" }, { id: 4, label: "Partidos" }, { id: 5, label: "Eleições" }, { id: 6, label: "Diplomacia" }] },
  { id: 2, name: "Economia", slug: "economia", description: "Finanças, mercados, empresas e o dia-a-dia da economia portuguesa e europeia.", icon: "◈", color: "#065f46", articles: 24, visible: true, order: 2, subtopics: [{ id: 7, label: "Mercados" }, { id: 8, label: "Empresas" }, { id: 9, label: "Habitação" }, { id: 10, label: "Turismo" }, { id: 11, label: "Trabalho" }] },
  { id: 3, name: "Sociedade", slug: "sociedade", description: "As histórias que moldam o Portugal de hoje — educação, saúde, desigualdade e cultura.", icon: "◎", color: "#7c3aed", articles: 18, visible: true, order: 3, subtopics: [{ id: 12, label: "Educação" }, { id: 13, label: "Saúde" }, { id: 14, label: "Ambiente" }, { id: 15, label: "Imigração" }] },
  { id: 4, name: "Investigação", slug: "investigacao", description: "Jornalismo de fundo, dados e fontes. As histórias que outros não contam.", icon: "◉", color: "#991b1b", articles: 9, visible: true, order: 4, subtopics: [{ id: 16, label: "Corrupção" }, { id: 17, label: "Justiça" }, { id: 18, label: "Contratos públicos" }] },
  { id: 5, name: "Mundo", slug: "mundo", description: "O que acontece além-fronteiras e como afecta Portugal.", icon: "◇", color: "#0e7490", articles: 14, visible: true, order: 5, subtopics: [{ id: 19, label: "Europa" }, { id: 20, label: "EUA" }, { id: 21, label: "Brasil" }, { id: 22, label: "Conflitos" }] },
  { id: 6, name: "Tecnologia", slug: "tecnologia", description: "Inovação, startups, inteligência artificial e o impacto digital na sociedade.", icon: "▣", color: "#0891b2", articles: 11, visible: true, order: 6, subtopics: [{ id: 23, label: "IA" }, { id: 24, label: "Startups" }, { id: 25, label: "Cibersegurança" }] },
  { id: 7, name: "Saúde", slug: "saude", description: "SNS, medicina, saúde pública e bem-estar dos portugueses.", icon: "◑", color: "#059669", articles: 7, visible: true, order: 7, subtopics: [{ id: 26, label: "SNS" }, { id: 27, label: "Medicamentos" }, { id: 28, label: "Saúde Mental" }] },
  { id: 8, name: "Cultura", slug: "cultura", description: "Artes, literatura, cinema, música e o pulsar cultural do país.", icon: "◈", color: "#b45309", articles: 6, visible: true, order: 8, subtopics: [{ id: 29, label: "Cinema" }, { id: 30, label: "Literatura" }, { id: 31, label: "Música" }, { id: 32, label: "Teatro" }] },
  { id: 9, name: "Desporto", slug: "desporto", description: "Futebol, modalidades e os heróis desportivos portugueses.", icon: "◎", color: "#dc2626", articles: 5, visible: false, order: 9, subtopics: [{ id: 33, label: "Futebol" }, { id: 34, label: "Modalidades" }, { id: 35, label: "Olimpíadas" }] },
];

const iconOptions = ["◆", "◈", "◎", "◉", "◇", "▣", "◑", "⊙", "◐", "◍"];

export default function AdminCategoriesClient() {
  const [categories, setCategories] = useState<Category[]>(initialCategories);
  const [editingId, setEditingId] = useState<number | null>(null);
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

  const saveEdit = (id: number) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...editData } : c)),
    );
    setEditingId(null);
  };

  const toggleVisible = (id: number) => {
    setCategories((prev) =>
      prev.map((c) => (c.id === id ? { ...c, visible: !c.visible } : c)),
    );
  };

  const removeSubtopic = (catId: number, stId: number) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? { ...c, subtopics: c.subtopics.filter((s) => s.id !== stId) }
          : c,
      ),
    );
  };

  const addSubtopic = (catId: number) => {
    if (!newTag.trim()) return;
    setCategories((prev) =>
      prev.map((c) =>
        c.id === catId
          ? { ...c, subtopics: [...c.subtopics, { id: Date.now(), label: newTag.trim() }] }
          : c,
      ),
    );
    setNewTag("");
  };

  const addCategory = () => {
    if (!newCat.name.trim()) return;
    const slug =
      newCat.slug ||
      newCat.name
        .toLowerCase()
        .replace(/\s+/g, "-")
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "");
    setCategories((prev) => [
      ...prev,
      {
        id: Date.now(),
        ...newCat,
        slug,
        articles: 0,
        visible: true,
        order: prev.length + 1,
        subtopics: [],
      },
    ]);
    setNewCat({ name: "", slug: "", description: "", icon: "◆", color: "#0F2C6B" });
    setShowNew(false);
  };

  const deleteCategory = (id: number) =>
    setCategories((prev) => prev.filter((c) => c.id !== id));

  return (
    <main className="bg-[#f6f7fb] p-8">
      {/* NEW CATEGORY MODAL */}
      {showNew && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowNew(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-5 text-xl font-black text-[#0F2C6B]">
              Nova categoria
            </h2>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Nome
                  </label>
                  <input
                    value={newCat.name}
                    onChange={(e) =>
                      setNewCat((p) => ({ ...p, name: e.target.value }))
                    }
                    placeholder="Ex: Desporto"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Slug
                  </label>
                  <input
                    value={newCat.slug}
                    onChange={(e) =>
                      setNewCat((p) => ({ ...p, slug: e.target.value }))
                    }
                    placeholder="ex: desporto"
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 font-mono text-sm focus:border-[#0F2C6B] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                  Descrição
                </label>
                <textarea
                  value={newCat.description}
                  onChange={(e) =>
                    setNewCat((p) => ({ ...p, description: e.target.value }))
                  }
                  placeholder="Breve descrição da rubrica…"
                  rows={3}
                  className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Ícone
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {iconOptions.map((ic) => (
                      <button
                        key={ic}
                        type="button"
                        onClick={() =>
                          setNewCat((p) => ({ ...p, icon: ic }))
                        }
                        className={`flex h-8 w-8 items-center justify-center rounded-lg text-base transition-all ${newCat.icon === ic ? "bg-[#0F2C6B] text-[#FFCC66]" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                      >
                        {ic}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                    Cor
                  </label>
                  <input
                    type="color"
                    value={newCat.color}
                    onChange={(e) =>
                      setNewCat((p) => ({ ...p, color: e.target.value }))
                    }
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
                className="flex-1 rounded-lg bg-[#0F2C6B] py-2.5 text-sm font-bold text-white hover:bg-[#1A3A7A]"
              >
                Criar categoria
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#0F2C6B]">Categorias</h1>
          <p className="mt-1 text-sm text-gray-500">
            {categories.length} rubricas ·{" "}
            {categories.filter((c) => c.visible).length} visíveis no site
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

      {/* CATEGORIES LIST */}
      <div className="space-y-3">
        {categories.map((cat) => {
          const isEditing = editingId === cat.id;
          return (
            <div
              key={cat.id}
              className={`rounded-xl border bg-white transition-all ${isEditing ? "border-[#0F2C6B]/30 shadow-md" : "border-gray-200 shadow-sm"}`}
            >
              {/* HEADER ROW */}
              <div className="flex items-center gap-4 p-4">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-lg text-white shadow-sm"
                  style={{
                    backgroundColor: isEditing
                      ? (editData.color ?? cat.color)
                      : cat.color,
                  }}
                >
                  {isEditing ? (editData.icon ?? cat.icon) : cat.icon}
                </div>

                {isEditing ? (
                  <div className="grid flex-1 grid-cols-2 gap-3">
                    <input
                      value={editData.name ?? ""}
                      onChange={(e) =>
                        setEditData((p) => ({ ...p, name: e.target.value }))
                      }
                      className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-bold focus:border-[#0F2C6B] focus:outline-none"
                      placeholder="Nome"
                    />
                    <input
                      value={editData.slug ?? ""}
                      onChange={(e) =>
                        setEditData((p) => ({ ...p, slug: e.target.value }))
                      }
                      className="rounded-lg border border-gray-200 px-3 py-1.5 font-mono text-sm focus:border-[#0F2C6B] focus:outline-none"
                      placeholder="slug"
                    />
                    <input
                      value={editData.description ?? ""}
                      onChange={(e) =>
                        setEditData((p) => ({
                          ...p,
                          description: e.target.value,
                        }))
                      }
                      className="col-span-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
                      placeholder="Descrição"
                    />
                    <div className="col-span-2 flex items-center gap-2">
                      <span className="text-xs font-semibold text-gray-500">
                        Ícone:
                      </span>
                      {iconOptions.map((ic) => (
                        <button
                          key={ic}
                          type="button"
                          onClick={() =>
                            setEditData((p) => ({ ...p, icon: ic }))
                          }
                          className={`flex h-7 w-7 items-center justify-center rounded text-sm transition-all ${(editData.icon ?? cat.icon) === ic ? "bg-[#0F2C6B] text-[#FFCC66]" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                        >
                          {ic}
                        </button>
                      ))}
                      <span className="ml-2 text-xs font-semibold text-gray-500">
                        Cor:
                      </span>
                      <input
                        type="color"
                        value={editData.color ?? cat.color}
                        onChange={(e) =>
                          setEditData((p) => ({ ...p, color: e.target.value }))
                        }
                        className="h-7 w-8 cursor-pointer rounded border border-gray-200"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-black text-[#0F2C6B]">
                        {cat.name}
                      </h3>
                      <span className="font-mono text-xs text-gray-400">
                        /{cat.slug}
                      </span>
                      {!cat.visible && (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                          OCULTA
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
                      {cat.description}
                    </p>
                  </div>
                )}

                <div className="ml-auto flex shrink-0 items-center gap-2">
                  <span className="hidden text-xs font-semibold text-gray-400 sm:inline">
                    {cat.articles} artigos
                  </span>

                  <button
                    type="button"
                    onClick={() => toggleVisible(cat.id)}
                    title={cat.visible ? "Ocultar do site" : "Mostrar no site"}
                    className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${cat.visible ? "bg-green-500" : "bg-gray-200"}`}
                  >
                    <span
                      className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${cat.visible ? "translate-x-4" : "translate-x-0.5"}`}
                    />
                  </button>

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
                        className="rounded-lg bg-[#0F2C6B] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1A3A7A]"
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
                        className="rounded-lg border border-gray-100 px-2 py-1.5 text-xs text-gray-300 transition-colors hover:border-red-200 hover:text-red-600"
                      >
                        ✕
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* SUBTOPICS */}
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
                      onClick={() => removeSubtopic(cat.id, s.id)}
                      className="ml-0.5 leading-none text-gray-300 transition-colors hover:text-red-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  value={editingId === cat.id ? newTag : ""}
                  onFocus={() => {
                    if (editingId !== cat.id) {
                      setEditingId(cat.id);
                      setEditData({
                        name: cat.name,
                        slug: cat.slug,
                        description: cat.description,
                        icon: cat.icon,
                        color: cat.color,
                      });
                    }
                  }}
                  onChange={(e) => setNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addSubtopic(cat.id);
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
