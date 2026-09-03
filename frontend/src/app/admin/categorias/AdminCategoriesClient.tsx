"use client";

import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { SortableRow } from "./SortableRow";
import {
  MAX_DEPTH,
  applyMove,
  flatten,
  getProjection,
  hasChildren,
  subtreeHeight,
  withoutCollapsed,
  withoutDescendants,
  type FlatNode,
  type Projection,
  type TreeNode,
} from "./tree-utils";
import {
  createCategoryAction,
  deleteCategoryAction,
  reorderCategoryAction,
  toggleCategoryFollowableAction,
  toggleCategoryVisibilityAction,
  updateCategoryAction,
} from "./actions";

const iconOptions = ["◆", "◈", "◎", "◉", "◇", "▣", "◑", "⊙", "◐", "◍"];

const LEVEL_LABEL = ["Categoria", "Subcategoria", "Tópico", "Subtópico"];

interface Props {
  initial: TreeNode[];
}

export default function AdminCategoriesClient({ initial }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Server truth, mirrored locally so a drop can be shown before the
  // round trip finishes. Re-synced during render — not in an effect —
  // whenever the server sends a new tree: an effect here would commit a
  // stale tree first and then cascade a second render over it.
  const [items, setItems] = useState<FlatNode[]>(() => flatten(initial));
  const [syncedFrom, setSyncedFrom] = useState(initial);
  if (syncedFrom !== initial) {
    setSyncedFrom(initial);
    setItems(flatten(initial));
  }

  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [offsetLeft, setOffsetLeft] = useState(0);
  const [overId, setOverId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Record<string, string>>({});
  const [newParent, setNewParent] = useState<FlatNode | null | undefined>(
    undefined,
  );
  const [newCat, setNewCat] = useState({
    name: "",
    slug: "",
    description: "",
    icon: "◆",
    color: "#0F2C6B",
  });

  /** The list a drag is measured against, and the one rendered. */
  const visible = useMemo(
    () => withoutCollapsed(items, collapsed),
    [items, collapsed],
  );
  const dragList = useMemo(
    () => (activeId ? withoutDescendants(visible, activeId) : visible),
    [visible, activeId],
  );
  const activeHeight = useMemo(
    () => (activeId ? subtreeHeight(items, activeId) : 0),
    [items, activeId],
  );

  const projection: Projection | null =
    activeId && overId
      ? getProjection(dragList, activeId, overId, offsetLeft, activeHeight)
      : null;

  const sensors = useSensors(
    // A few pixels of slack so a click on the handle isn't read as a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const wrap = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.error ?? "Falha.");
      else {
        setError(null);
        router.refresh();
      }
    });

  // ── drag ────────────────────────────────────────────────────────────
  const snapshot = useRef<FlatNode[]>([]);

  const onDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id));
    setOverId(String(active.id));
    setError(null);
    snapshot.current = items;
  };

  const onDragMove = ({ delta, over }: DragMoveEvent) => {
    setOffsetLeft(delta.x);
    if (over) setOverId(String(over.id));
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const id = String(active.id);
    const target = over && projection ? projection : null;
    reset();
    if (!target) return;

    const before = snapshot.current;
    const node = before.find((i) => i.id === id);
    if (!node) return;

    // Dropped exactly where it started — same mother, same position among
    // its siblings. Don't spend a request, and don't flash the row.
    const currentIndex = before
      .filter((i) => i.parentId === node.parentId)
      .findIndex((i) => i.id === id);
    if (node.parentId === target.parentId && currentIndex === target.index) {
      return;
    }

    // Optimistic: show the result now, undo it if the server refuses.
    setItems(applyMove(before, id, target));
    startTransition(async () => {
      const r = await reorderCategoryAction({
        id,
        parentId: target.parentId,
        index: target.index,
      });
      if (!r.ok) {
        setItems(before);
        setError(r.error ?? "Não foi possível mover.");
      } else {
        setError(null);
        router.refresh();
      }
    });
  };

  const reset = () => {
    setActiveId(null);
    setOverId(null);
    setOffsetLeft(0);
  };

  const toggleCollapse = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // ── CRUD ────────────────────────────────────────────────────────────
  const startEdit = (c: FlatNode) => {
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

  const addCategory = () => {
    if (!newCat.name.trim()) return;
    const parentId = newParent ? newParent.id : null;
    wrap(async () =>
      createCategoryAction({
        ...newCat,
        slug: newCat.slug.trim() || undefined,
        parentId,
      }),
    );
    setNewCat({ name: "", slug: "", description: "", icon: "◆", color: "#0F2C6B" });
    setNewParent(undefined);
  };

  const activeNode = activeId ? items.find((i) => i.id === activeId) : null;
  const rootCount = items.filter((i) => i.parentId === null).length;

  return (
    <main className="bg-[#f6f7fb] p-8">
      {newParent !== undefined && (
        <NewCategoryDialog
          parent={newParent}
          value={newCat}
          onChange={setNewCat}
          onCancel={() => setNewParent(undefined)}
          onSubmit={addCategory}
          pending={isPending}
        />
      )}

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-[#0F2C6B]">Categorias</h1>
          <p className="mt-1 text-sm text-gray-500">
            {rootCount} de topo · {items.length} no total ·{" "}
            {items.filter((c) => c.visible).length} visíveis no site
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Arraste pelo <span aria-hidden>⠿</span> para reordenar. Arraste para
            a direita para tornar subcategoria, para a esquerda para promover.
            Até {MAX_DEPTH + 1} níveis.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewParent(null)}
          className="shrink-0 rounded-lg bg-[#0F2C6B] px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-[#1A3A7A]"
        >
          + Nova categoria
        </button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {/* id fixo, e não é decorativo: o dnd-kit gera o id do
          aria-describedby das pegas com um contador AO NÍVEL DO MÓDULO
          (useUniqueId em @dnd-kit/utilities), não com o useId do React.
          No servidor esse módulo dura o tempo do processo e o contador
          incrementa a cada pedido; no cliente arranca sempre do zero.
          Sem este id, cada render servia DndDescribedBy-N e o cliente
          hidratava com -0 — e o React não corrige o atributo, por isso
          o aria-describedby ficava a apontar para um elemento que não
          existe e as instruções de arrastar para leitores de ecrã
          ficavam mudas. Passar um id faz o useUniqueId devolvê-lo tal
          e qual. */}
      <DndContext
        id="admin-categorias-dnd"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={onDragStart}
        onDragMove={onDragMove}
        onDragEnd={onDragEnd}
        onDragCancel={reset}
      >
        <SortableContext
          items={dragList.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {dragList.map((cat) => (
              <SortableRow
                key={cat.id}
                id={cat.id}
                depth={
                  activeId === cat.id && projection ? projection.depth : cat.depth
                }
                handleLabel={`Mover ${cat.name}`}
              >
                <CategoryRow
                  cat={cat}
                  editing={editingId === cat.id}
                  editData={editData}
                  setEditData={setEditData}
                  onStartEdit={() => startEdit(cat)}
                  onCancelEdit={() => setEditingId(null)}
                  onSave={() => saveEdit(cat.id)}
                  onDelete={() => wrap(async () => deleteCategoryAction(cat.id))}
                  onToggleVisible={() =>
                    wrap(async () =>
                      toggleCategoryVisibilityAction(cat.id, !cat.visible),
                    )
                  }
                  onToggleFollowable={() =>
                    wrap(async () =>
                      toggleCategoryFollowableAction(cat.id, !cat.followable),
                    )
                  }
                  onAddChild={() => setNewParent(cat)}
                  collapsible={hasChildren(items, cat.id)}
                  collapsed={collapsed.has(cat.id)}
                  onToggleCollapse={() => toggleCollapse(cat.id)}
                  childCount={countChildren(items, cat.id)}
                  pending={isPending}
                />
              </SortableRow>
            ))}
          </div>
        </SortableContext>

        <DragOverlay>
          {activeNode ? (
            <div className="flex items-center gap-3 rounded-xl border border-[#0F2C6B]/30 bg-white px-4 py-3 shadow-2xl">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg text-sm text-white"
                style={{ backgroundColor: activeNode.color }}
              >
                {activeNode.icon}
              </span>
              <span className="text-sm font-black text-[#0F2C6B]">
                {activeNode.name}
              </span>
              {activeHeight > 0 && (
                <span className="rounded-full bg-[#F0F2F7] px-2 py-0.5 text-[10px] font-bold text-gray-500">
                  + subcategorias
                </span>
              )}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {items.length === 0 && (
        <p className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          Ainda não há categorias.
        </p>
      )}
    </main>
  );
}

function countChildren(items: FlatNode[], id: string): number {
  return items.filter((i) => i.parentId === id).length;
}

// ── row ───────────────────────────────────────────────────────────────
function CategoryRow({
  cat,
  editing,
  editData,
  setEditData,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  onToggleVisible,
  onToggleFollowable,
  onAddChild,
  collapsible,
  collapsed,
  onToggleCollapse,
  childCount,
  pending,
}: {
  cat: FlatNode;
  editing: boolean;
  editData: Record<string, string>;
  setEditData: (fn: (p: Record<string, string>) => Record<string, string>) => void;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onSave: () => void;
  onDelete: () => void;
  onToggleVisible: () => void;
  onToggleFollowable: () => void;
  onAddChild: () => void;
  collapsible: boolean;
  collapsed: boolean;
  onToggleCollapse: () => void;
  childCount: number;
  pending: boolean;
}) {
  const atMaxDepth = cat.depth >= MAX_DEPTH;

  return (
    <div
      className={`rounded-r-xl border bg-white transition-all ${
        editing ? "border-[#0F2C6B]/30 shadow-md" : "border-gray-200 shadow-sm"
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          onClick={onToggleCollapse}
          disabled={!collapsible}
          aria-label={
            collapsible
              ? collapsed
                ? `Expandir ${cat.name}`
                : `Colapsar ${cat.name}`
              : undefined
          }
          aria-expanded={collapsible ? !collapsed : undefined}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] ${
            collapsible
              ? "text-gray-400 hover:bg-gray-100 hover:text-[#0F2C6B]"
              : "invisible"
          }`}
        >
          <span aria-hidden>{collapsed ? "▶" : "▼"}</span>
        </button>

        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-base text-white shadow-sm"
          style={{ backgroundColor: editing ? editData.color : cat.color }}
        >
          {editing ? editData.icon : cat.icon}
        </div>

        {editing ? (
          <div className="grid flex-1 grid-cols-2 gap-2">
            <input
              value={editData.name ?? ""}
              onChange={(e) =>
                setEditData((p) => ({ ...p, name: e.target.value }))
              }
              aria-label="Nome"
              className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-bold focus:border-[#0F2C6B] focus:outline-none"
            />
            <input
              value={editData.slug ?? ""}
              onChange={(e) =>
                setEditData((p) => ({ ...p, slug: e.target.value }))
              }
              aria-label="Slug"
              className="rounded-lg border border-gray-200 px-3 py-1.5 font-mono text-sm focus:border-[#0F2C6B] focus:outline-none"
            />
            <input
              value={editData.description ?? ""}
              onChange={(e) =>
                setEditData((p) => ({ ...p, description: e.target.value }))
              }
              aria-label="Descrição"
              className="col-span-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
            />
            <div className="col-span-2 flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-semibold text-gray-500">Ícone:</span>
              {iconOptions.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setEditData((p) => ({ ...p, icon: ic }))}
                  aria-label={`Ícone ${ic}`}
                  aria-pressed={editData.icon === ic}
                  className={`flex h-7 w-7 items-center justify-center rounded text-sm ${
                    editData.icon === ic
                      ? "bg-[#0F2C6B] text-[#FFCC66]"
                      : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                  }`}
                >
                  {ic}
                </button>
              ))}
              <span className="ml-2 text-xs font-semibold text-gray-500">Cor:</span>
              <input
                type="color"
                aria-label="Cor"
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
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-black text-[#0F2C6B]">{cat.name}</h3>
              <span className="font-mono text-xs text-gray-400">/{cat.slug}</span>
              <span className="rounded-full bg-[#F0F2F7] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-500">
                {LEVEL_LABEL[cat.depth]}
              </span>
              {!cat.visible && (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                  OCULTA
                </span>
              )}
              {childCount > 0 && (
                <span className="text-[10px] font-semibold text-gray-400">
                  {childCount} {childCount === 1 ? "filha" : "filhas"}
                </span>
              )}
            </div>
            <p className="mt-0.5 line-clamp-1 text-xs text-gray-500">
              {cat.description}
              {cat.articleCountTotal > 0 && (
                <span className="ml-2 text-gray-400">
                  · {cat.articleCount} próprios / {cat.articleCountTotal} com
                  subcategorias
                </span>
              )}
            </p>
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-3">
          {/* Two switches, two different questions. The first is
              whether the section exists on the site; the second is
              whether readers are invited to subscribe to it by e-mail.
              Labelled, because two identical switches side by side are
              a coin toss. */}
          <div className="flex flex-col items-center gap-1">
            <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
              No site
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={cat.visible}
              aria-label={
                cat.visible
                  ? "Ocultar do menu público"
                  : "Mostrar no menu público"
              }
              title={
                cat.visible
                  ? "Aparece no menu do site. Clique para esconder."
                  : "Escondida do site. Clique para mostrar."
              }
              onClick={onToggleVisible}
              disabled={pending}
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
          </div>

          {/* Só nas secções de topo.
              Seguir é uma subscrição à secção inteira: quem segue
              "Portugal" recebe o que sair em Portugal › Madeira ›
              Funchal › Sé, sem ter de seguir cada um. Um interruptor
              numa subsecção não acrescentaria nada — ligá-lo não a
              oferecia a ninguém (listFollowableCategories() só devolve
              depth 0) e desligá-lo não impedia os avisos, que continuam
              a chegar por via da raiz. Era um botão que prometia um
              controlo inexistente, e por isso não está cá. */}
          {cat.depth === 0 && (
            <div className="flex flex-col items-center gap-1">
              <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400">
                Seguir
              </span>
              <button
                type="button"
                role="switch"
                aria-checked={cat.followable}
                aria-label={
                  cat.followable
                    ? "Retirar da lista que os leitores podem seguir"
                    : "Permitir que os leitores sigam esta secção"
                }
                title={
                  !cat.visible
                    ? "Está escondida do site, por isso não é oferecida a ninguém."
                    : cat.followable
                      ? "Os leitores podem segui-la, e com ela tudo o que está por baixo. Clique para retirar da lista."
                      : "Ainda não é oferecida aos leitores. Clique quando estiver pronta."
                }
                onClick={onToggleFollowable}
                // Hidden from the site means nobody is offered it whatever
                // this says, so the switch would be claiming something
                // untrue. Disabled rather than hidden: it keeps its place
                // and the tooltip explains why.
                disabled={pending || !cat.visible}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#0F2C6B]/30 disabled:opacity-40 ${
                  cat.followable && cat.visible
                    ? "border-amber-600 bg-amber-500"
                    : "border-gray-300 bg-gray-200"
                }`}
              >
                <span
                  aria-hidden
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition-transform duration-200 ease-in-out ${
                    cat.followable && cat.visible
                      ? "translate-x-5"
                      : "translate-x-0.5"
                  }`}
                />
              </button>
            </div>
          )}

          {editing ? (
            <>
              <button
                type="button"
                onClick={onCancelEdit}
                className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs text-gray-400 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={onSave}
                disabled={pending}
                className="rounded-lg bg-[#0F2C6B] px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-[#1A3A7A] disabled:opacity-50"
              >
                Guardar
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onAddChild}
                disabled={atMaxDepth}
                title={
                  atMaxDepth
                    ? `Profundidade máxima de ${MAX_DEPTH + 1} níveis atingida`
                    : `Nova subcategoria em ${cat.name}`
                }
                className="rounded-lg border border-gray-200 px-2 py-1.5 text-xs font-semibold text-gray-500 hover:border-[#0F2C6B]/30 hover:text-[#0F2C6B] disabled:cursor-not-allowed disabled:opacity-30"
              >
                + sub
              </button>
              <button
                type="button"
                onClick={onStartEdit}
                className="rounded-lg border border-[#0F2C6B]/20 px-2.5 py-1.5 text-xs font-semibold text-[#0F2C6B] hover:bg-[#0F2C6B]/5"
              >
                Editar
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                aria-label={`Eliminar ${cat.name}`}
                className="rounded-lg border border-gray-100 px-2 py-1.5 text-xs text-gray-300 transition-colors hover:border-red-200 hover:text-red-600"
              >
                ✕
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── new category dialog ───────────────────────────────────────────────
function NewCategoryDialog({
  parent,
  value,
  onChange,
  onCancel,
  onSubmit,
  pending,
}: {
  parent: FlatNode | null;
  value: { name: string; slug: string; description: string; icon: string; color: string };
  onChange: (
    fn: (p: {
      name: string;
      slug: string;
      description: string;
      icon: string;
      color: string;
    }) => {
      name: string;
      slug: string;
      description: string;
      icon: string;
      color: string;
    },
  ) => void;
  onCancel: () => void;
  onSubmit: () => void;
  pending: boolean;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={parent ? `Nova subcategoria em ${parent.name}` : "Nova categoria"}
        className="w-full max-w-md rounded-2xl bg-white p-7 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-xl font-black text-[#0F2C6B]">
          {parent ? "Nova subcategoria" : "Nova categoria"}
        </h2>
        {parent && (
          <p className="mb-5 text-xs text-gray-500">
            Dentro de <strong className="text-[#0F2C6B]">{parent.name}</strong> ·{" "}
            {LEVEL_LABEL[Math.min(parent.depth + 1, MAX_DEPTH)]}
          </p>
        )}
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="new-cat-name"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500"
              >
                Nome
              </label>
              <input
                id="new-cat-name"
                value={value.name}
                onChange={(e) => onChange((p) => ({ ...p, name: e.target.value }))}
                placeholder="Ex: Funchal"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
              />
            </div>
            <div>
              <label
                htmlFor="new-cat-slug"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500"
              >
                Slug
              </label>
              <input
                id="new-cat-slug"
                value={value.slug}
                onChange={(e) => onChange((p) => ({ ...p, slug: e.target.value }))}
                placeholder="deixe vazio para gerar"
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 font-mono text-sm focus:border-[#0F2C6B] focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label
              htmlFor="new-cat-desc"
              className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500"
            >
              Descrição
            </label>
            <textarea
              id="new-cat-desc"
              value={value.description}
              onChange={(e) =>
                onChange((p) => ({ ...p, description: e.target.value }))
              }
              rows={3}
              className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2.5 text-sm focus:border-[#0F2C6B] focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500">
                Ícone
              </span>
              <div className="flex flex-wrap gap-1.5">
                {iconOptions.map((ic) => (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => onChange((p) => ({ ...p, icon: ic }))}
                    aria-label={`Ícone ${ic}`}
                    aria-pressed={value.icon === ic}
                    className={`flex h-8 w-8 items-center justify-center rounded-lg text-base ${
                      value.icon === ic
                        ? "bg-[#0F2C6B] text-[#FFCC66]"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                    }`}
                  >
                    {ic}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label
                htmlFor="new-cat-color"
                className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-gray-500"
              >
                Cor
              </label>
              <input
                id="new-cat-color"
                type="color"
                value={value.color}
                onChange={(e) => onChange((p) => ({ ...p, color: e.target.value }))}
                className="h-10 w-full cursor-pointer rounded-lg border border-gray-200"
              />
            </div>
          </div>
        </div>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-500 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={pending}
            className="flex-1 rounded-lg bg-[#0F2C6B] py-2.5 text-sm font-bold text-white hover:bg-[#1A3A7A] disabled:opacity-50"
          >
            {pending ? "A criar…" : "Criar"}
          </button>
        </div>
      </div>
    </div>
  );
}
