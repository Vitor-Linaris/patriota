/**
 * Flat-list tree mechanics for the drag-and-drop category admin.
 *
 * The whole design rests on one invariant: the flat list is in
 * depth-first order, so a node's subtree is exactly the contiguous run of
 * items after it whose depth is greater than its own. Every operation
 * below — finding a subtree, lifting it out, reinserting it — is a slice
 * on that run rather than a recursive walk.
 */

/** categoria(0) → subcategoria → tópico → subtópico(3). */
export const MAX_DEPTH = 3;
export const INDENT_WIDTH = 28;

export interface TreeNode {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  visible: boolean;
  /**
   * Whether readers are offered this section to follow by e-mail.
   *
   * Not the same question as `visible`, which is the public menu. A
   * section can be live without the newsroom being ready to promise
   * mail about it — one being tried out, or one about to be renamed.
   */
  followable: boolean;
  parentId: string | null;
  depth: number;
  order: number;
  articleCount: number;
  articleCountTotal: number;
  children: TreeNode[];
}

export interface FlatNode {
  id: string;
  name: string;
  slug: string;
  description: string;
  icon: string;
  color: string;
  visible: boolean;
  followable: boolean;
  parentId: string | null;
  depth: number;
  articleCount: number;
  articleCountTotal: number;
}

export function flatten(nodes: TreeNode[]): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (list: TreeNode[]) => {
    for (const n of list) {
      const { children, order: _order, ...rest } = n;
      void _order;
      out.push(rest);
      if (children?.length) walk(children);
    }
  };
  walk(nodes);
  return out;
}

/** How many items the subtree at `index` spans, the node itself included. */
export function subtreeSize(items: FlatNode[], index: number): number {
  const base = items[index].depth;
  let size = 1;
  while (index + size < items.length && items[index + size].depth > base) size++;
  return size;
}

/** Levels below `id`. A leaf is 0; a node with grandchildren is 2. */
export function subtreeHeight(items: FlatNode[], id: string): number {
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return 0;
  const size = subtreeSize(items, index);
  const base = items[index].depth;
  let max = base;
  for (let i = index; i < index + size; i++) {
    if (items[i].depth > max) max = items[i].depth;
  }
  return max - base;
}

/**
 * The list a drag operates against: everything except the dragged node's
 * DESCENDANTS (the node itself stays, as the thing being moved).
 *
 * This is what makes "drop a node inside itself" unrepresentable rather
 * than merely validated — if the descendants aren't in the list, there is
 * no target inside them to drop onto. The server still checks, because
 * the API is reachable without this UI.
 */
export function withoutDescendants(items: FlatNode[], id: string): FlatNode[] {
  const index = items.findIndex((i) => i.id === id);
  if (index === -1) return items;
  const size = subtreeSize(items, index);
  return [...items.slice(0, index + 1), ...items.slice(index + size)];
}

/** Hides the children of every collapsed node. */
export function withoutCollapsed(
  items: FlatNode[],
  collapsed: Set<string>,
): FlatNode[] {
  const out: FlatNode[] = [];
  let skipBelow: number | null = null;
  for (const item of items) {
    if (skipBelow !== null) {
      if (item.depth > skipBelow) continue;
      skipBelow = null;
    }
    out.push(item);
    if (collapsed.has(item.id)) skipBelow = item.depth;
  }
  return out;
}

export function hasChildren(items: FlatNode[], id: string): boolean {
  const index = items.findIndex((i) => i.id === id);
  return index !== -1 && subtreeSize(items, index) > 1;
}

function arrayMove<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list];
  copy.splice(to < 0 ? copy.length + to : to, 0, copy.splice(from, 1)[0]);
  return copy;
}

export interface Projection {
  depth: number;
  parentId: string | null;
  /** Position among the destination's children. */
  index: number;
  /** Where the node lands in the descendant-free list. */
  overIndex: number;
}

/**
 * Where the drag would land: depth comes from the HORIZONTAL offset,
 * clamped by the neighbours it is being dropped between.
 *
 * This is the WordPress menu interaction the newsroom asked for — you
 * drag right to nest, left to promote — and the clamping is what stops it
 * producing a hierarchy the server would reject: you cannot indent past
 * the item above (nothing to nest under), nor past the depth budget the
 * dragged subtree needs.
 */
export function getProjection(
  items: FlatNode[],
  activeId: string,
  overId: string,
  dragOffset: number,
  activeHeight: number,
): Projection {
  const activeIndex = items.findIndex((i) => i.id === activeId);
  const overIndex = items.findIndex((i) => i.id === overId);
  if (activeIndex === -1 || overIndex === -1) {
    return { depth: 0, parentId: null, index: 0, overIndex: 0 };
  }

  const moved = arrayMove(items, activeIndex, overIndex);
  const previous = moved[overIndex - 1];
  const next = moved[overIndex + 1];

  const projected =
    items[activeIndex].depth + Math.round(dragOffset / INDENT_WIDTH);

  // Can't nest deeper than one level below the item above, and can't
  // spend more depth than the travelling subtree leaves available.
  const ceiling = Math.min(
    previous ? previous.depth + 1 : 0,
    MAX_DEPTH - activeHeight,
  );
  // Can't sit shallower than the item below, or it would be orphaned.
  const floor = next ? next.depth : 0;

  const depth = Math.max(0, Math.min(Math.max(projected, floor), ceiling));
  const parentId = resolveParent(moved, overIndex, depth, previous);

  let index = 0;
  for (let i = 0; i < overIndex; i++) {
    if (moved[i].parentId === parentId) index++;
  }

  return { depth, parentId, index, overIndex };
}

function resolveParent(
  moved: FlatNode[],
  overIndex: number,
  depth: number,
  previous: FlatNode | undefined,
): string | null {
  if (depth === 0 || !previous) return null;
  if (depth > previous.depth) return previous.id;
  if (depth === previous.depth) return previous.parentId;
  // Dropped shallower than the item above: the new mother is whichever
  // ancestor already sits at this depth.
  for (let i = overIndex - 1; i >= 0; i--) {
    if (moved[i].depth === depth) return moved[i].parentId;
  }
  return null;
}

/**
 * Applies the projection to the FULL list (descendants included), so the
 * UI can show the result before the server has confirmed it.
 */
export function applyMove(
  all: FlatNode[],
  activeId: string,
  projection: Projection,
): FlatNode[] {
  const start = all.findIndex((i) => i.id === activeId);
  if (start === -1) return all;

  const size = subtreeSize(all, start);
  const delta = projection.depth - all[start].depth;
  const travelling = all.slice(start, start + size).map((item, i) => ({
    ...item,
    depth: item.depth + delta,
    parentId: i === 0 ? projection.parentId : item.parentId,
  }));

  const rest = [...all.slice(0, start), ...all.slice(start + size)];
  const at = Math.max(0, Math.min(projection.overIndex, rest.length));
  return [...rest.slice(0, at), ...travelling, ...rest.slice(at)];
}
